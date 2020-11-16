// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { lstat } from "fs-extra";
import * as globby from "globby";
import * as _ from "lodash";
import { platform } from "os";
import { dirname, extname, isAbsolute, join, relative } from "path";
import {
    CustomExecution, Event, EventEmitter, Pseudoterminal, Task, TaskDefinition,
    TaskProvider, TaskRevealKind, TaskScope, TerminalDimensions, Uri, workspace, WorkspaceFolder,
} from "vscode";
import { createJarFile } from "../exportJarFileCommand";
import { Jdtls } from "../java/jdtls";
import { INodeData } from "../java/nodeData";
import { Settings } from "../settings";
import { IUriData, Trie, TrieNode } from "../views/nodeCache/Trie";
import { IClasspathResult } from "./GenerateJarExecutor";
import { IClasspath, IStepMetadata } from "./IStepMetadata";
import { IMainClassInfo } from "./ResolveMainClassExecutor";
import { ExportJarConstants, failMessage, getExtensionApi, toPosixPath, toWinPath } from "./utility";

interface IExportJarTaskDefinition extends TaskDefinition {
    label?: string;
    mainClass?: string;
    targetPath?: string;
    elements?: string[];
}

export class ExportJarTaskProvider implements TaskProvider {

    public static exportJarType: string = "java";

    public static getTask(stepMetadata: IStepMetadata): Task {
        const defaultDefinition: IExportJarTaskDefinition = {
            type: ExportJarTaskProvider.exportJarType,
            label: `${ExportJarTaskProvider.exportJarType}: exportjar:default`,
            targetPath: Settings.getExportJarTargetPath(),
            elements: [],
            mainClass: undefined,
        };
        const task: Task = new Task(defaultDefinition, TaskScope.Workspace, "exportjar:default", ExportJarTaskProvider.exportJarType,
            new CustomExecution(async (resolvedDefinition: TaskDefinition): Promise<Pseudoterminal> => {
                return new ExportJarTaskTerminal(resolvedDefinition, stepMetadata);
            }));
        task.presentationOptions.reveal = TaskRevealKind.Never;
        return task;
    }

    private tasks: Task[] | undefined;

    public async resolveTask(task: Task): Promise<Task> {
        const definition: IExportJarTaskDefinition = <IExportJarTaskDefinition>task.definition;
        const folder: WorkspaceFolder = <WorkspaceFolder>task.scope;
        const resolvedTask: Task = new Task(definition, folder, task.name, ExportJarTaskProvider.exportJarType,
            new CustomExecution(async (resolvedDefinition: TaskDefinition): Promise<Pseudoterminal> => {
                const stepMetadata: IStepMetadata = {
                    entry: undefined,
                    workspaceFolder: folder,
                    projectList: await Jdtls.getProjects(folder.uri.toString()),
                    steps: [],
                };
                return new ExportJarTaskTerminal(resolvedDefinition, stepMetadata);
            }));
        resolvedTask.presentationOptions.reveal = TaskRevealKind.Never;
        return resolvedTask;
    }

    public async provideTasks(): Promise<Task[]> {
        if (!_.isEmpty(this.tasks)) {
            return this.tasks;
        }
        this.tasks = [];
        for (const folder of workspace.workspaceFolders) {
            const projectList: INodeData[] = await Jdtls.getProjects(folder.uri.toString());
            const elementList: string[] = [];
            if (_.isEmpty(projectList)) {
                continue;
            } else if (projectList.length === 1) {
                elementList.push("${" + ExportJarConstants.COMPILE_OUTPUT + "}",
                    "${" + ExportJarConstants.DEPENDENCIES + "}");
            } else {
                for (const project of projectList) {
                    elementList.push("${" + ExportJarConstants.COMPILE_OUTPUT + ":" + project.name + "}",
                        "${" + ExportJarConstants.DEPENDENCIES + ":" + project.name + "}");
                }
            }
            const mainClasses: IMainClassInfo[] = await Jdtls.getMainClasses(folder.uri.toString());
            const defaultDefinition: IExportJarTaskDefinition = {
                type: ExportJarTaskProvider.exportJarType,
                label: `${ExportJarTaskProvider.exportJarType}: exportjar:${folder.name}`,
                mainClass: (mainClasses.length === 1) ? mainClasses[0].name : undefined,
                targetPath: Settings.getExportJarTargetPath(),
                elements: elementList,
            };
            const defaultTask: Task = new Task(defaultDefinition, folder, `exportjar:${folder.name}`,
                ExportJarTaskProvider.exportJarType, new CustomExecution(async (resolvedDefinition: TaskDefinition): Promise<Pseudoterminal> => {
                    const stepMetadata: IStepMetadata = {
                        entry: undefined,
                        workspaceFolder: folder,
                        projectList: await Jdtls.getProjects(folder.uri.toString()),
                        steps: [],
                    };
                    return new ExportJarTaskTerminal(resolvedDefinition, stepMetadata);
                }), undefined);
            defaultTask.presentationOptions.reveal = TaskRevealKind.Never;
            this.tasks.push(defaultTask);
        }
        return this.tasks;
    }
}

class ExportJarTaskTerminal implements Pseudoterminal {

    public writeEmitter = new EventEmitter<string>();
    public closeEmitter = new EventEmitter<void>();

    public onDidWrite: Event<string> = this.writeEmitter.event;
    public onDidClose?: Event<void> = this.closeEmitter.event;

    private stepMetadata: IStepMetadata;

    constructor(exportJarTaskDefinition: IExportJarTaskDefinition, stepMetadata: IStepMetadata) {
        this.stepMetadata = stepMetadata;
        this.stepMetadata.mainClass = exportJarTaskDefinition.mainClass;
        this.stepMetadata.outputPath = exportJarTaskDefinition.targetPath;
        this.stepMetadata.elements = exportJarTaskDefinition.elements;
    }

    public async open(_initialDimensions: TerminalDimensions | undefined): Promise<void> {
        try {
            if (this.stepMetadata.outputPath === undefined) {
                // TODO: get resolved path from setting configuration.java.project.exportJar.targetPath.
                // For the tasks whose targetPath is undefined, the user will select the output location manually.
                this.stepMetadata.outputPath = "";
            }
            if (!_.isEmpty(this.stepMetadata.elements)) {
                const outputFolderMap: Map<string, string[]> = new Map<string, string[]>();
                const artifactMap: Map<string, string[]> = new Map<string, string[]>();
                const testOutputFolderMap: Map<string, string[]> = new Map<string, string[]>();
                const testArtifactMap: Map<string, string[]> = new Map<string, string[]>();
                const projectList: INodeData[] = await Jdtls.getProjects(this.stepMetadata.workspaceFolder.uri.toString());
                for (const project of projectList) {
                    await this.setClasspathMap(project, "runtime", outputFolderMap, artifactMap);
                    await this.setClasspathMap(project, "test", testOutputFolderMap, testArtifactMap);
                }
                this.stepMetadata.classpaths = await this.resolveClasspaths(outputFolderMap,
                    artifactMap, testOutputFolderMap, testArtifactMap);
            }
            await createJarFile(this.stepMetadata);
        } catch (err) {
            if (err) {
                failMessage(`${err}`);
            }
        } finally {
            this.closeEmitter.fire();
        }
    }

    public close(): void {

    }

    private async setClasspathMap(project: INodeData, classpathScope: string,
                                  outputFolderMap: Map<string, string[]>, artifactMap: Map<string, string[]>): Promise<void> {
        const extensionApi: any = await getExtensionApi();
        const classpathResult: IClasspathResult = await extensionApi.getClasspaths(project.uri, { scope: classpathScope });
        const outputFolders: string[] = [];
        const artifacts: string[] = [];
        for (const classpath of [...classpathResult.classpaths, ...classpathResult.modulepaths]) {
            if (extname(classpath) === ".jar") {
                artifacts.push(classpath);
            } else {
                outputFolders.push(classpath);
            }
        }
        outputFolderMap.set(project.name, outputFolders);
        artifactMap.set(project.name, artifacts);
    }

    private async resolveClasspaths(outputFolderMap: Map<string, string[]>,
                                    artifactMap: Map<string, string[]>,
                                    testOutputFolderMap: Map<string, string[]>,
                                    testArtifactMap: Map<string, string[]>): Promise<IClasspath[]> {
        const regExp: RegExp = /\${(.*?)(:.*)?}/;
        let outputElements: string[] = [];
        let artifacts: string[] = [];
        for (const element of this.stepMetadata.elements) {
            if (element.length === 0) {
                continue;
            }
            const matchResult = element.match(regExp);
            if (_.isEmpty(matchResult) || matchResult.length <= 2) {
                if (extname(element) === ".jar") {
                    artifacts.push(this.toAbsolutePosixPath(element));
                } else {
                    outputElements.push(this.toAbsolutePosixPath(element));
                }
                continue;
            }
            const projectName: string = (matchResult[2] === undefined) ? undefined : matchResult[2].substring(1);
            switch (matchResult[1]) {
                case ExportJarConstants.DEPENDENCIES:
                    artifacts = artifacts.concat(this.getJarElementsFromClasspathMapping(matchResult, artifactMap, projectName));
                    break;
                case ExportJarConstants.TEST_DEPENDENCIES:
                    artifacts = artifacts.concat(this.getJarElementsFromClasspathMapping(matchResult, testArtifactMap, projectName));
                    break;
                case ExportJarConstants.COMPILE_OUTPUT:
                    outputElements = outputElements.concat(this.getJarElementsFromClasspathMapping(matchResult, outputFolderMap, projectName));
                    break;
                case ExportJarConstants.TEST_COMPILE_OUTPUT:
                    outputElements = outputElements.concat(this.getJarElementsFromClasspathMapping(matchResult, testOutputFolderMap, projectName));
                    break;
            }
        }
        const trie: Trie<IUriData> = new Trie<IUriData>();
        const globPatterns: string[] = [];
        for (const outputElement of outputElements) {
            if (outputElement.length === 0) {
                continue;
            }
            if (outputElement[0] !== "!") {
                const uri: Uri = Uri.file(platform() === "win32" ? toWinPath(outputElement) : outputElement);
                const uriData: IUriData = {
                    uri: uri.toString(),
                };
                trie.insert(uriData);
            }
            globPatterns.push(outputElement);
        }
        const sources: IClasspath[] = [];
        for (const glob of await globby(globPatterns)) {
            const tireNode: TrieNode<IUriData> = trie.find(Uri.file(platform() === "win32" ? toWinPath(glob) : glob).fsPath, /* returnEarly = */true);
            if (tireNode === undefined) {
                continue;
            }
            let fsPath = Uri.parse(tireNode.value.uri).fsPath;
            if ((await lstat(fsPath)).isFile()) {
                fsPath = dirname(fsPath);
            }
            if (!_.isEmpty(tireNode)) {
                const classpath: IClasspath = {
                    source: glob,
                    destination: relative(fsPath, glob),
                    isArtifact: false,
                };
                sources.push(classpath);
            }
        }
        for (const artifact of await globby(artifacts)) {
            const classpath: IClasspath = {
                source: artifact,
                destination: undefined,
                isArtifact: true,
            };
            sources.push(classpath);
        }
        return sources;
    }

    private getJarElementsFromClasspathMapping(matchResult: RegExpMatchArray, rawClasspathEntries: Map<string, string[]>,
                                               projectName: string | undefined): string[] {
        const result: string[] = [];
        if (projectName !== undefined) {
            for (const classpath of rawClasspathEntries.get(projectName)) {
                result.push(this.toAbsolutePosixPath(matchResult.input.replace(matchResult[0], classpath)));
            }
        } else {
            for (const classpaths of rawClasspathEntries.values()) {
                for (const classpath of classpaths) {
                    result.push(this.toAbsolutePosixPath(matchResult.input.replace(matchResult[0], classpath)));
                }
            }
        }
        return result;
    }

    private toAbsolutePosixPath(path: string): string {
        const negative: boolean = (path[0] === "!");
        let positivePath: string = negative ? path.substring(1) : path;
        if (!isAbsolute(positivePath)) {
            positivePath = join(this.stepMetadata.workspaceFolder.uri.fsPath, positivePath);
        }
        positivePath = toPosixPath(positivePath);
        return negative ? "!" + positivePath : positivePath;
    }
}
