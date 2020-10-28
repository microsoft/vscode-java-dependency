// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { lstat } from "fs-extra";
import * as globby from "globby";
import * as _ from "lodash";
import { dirname, extname, isAbsolute, join, normalize, relative } from "path";
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
import { IClassPath, IStepMetadata } from "./IStepMetadata";
import { ExportJarProperties, failMessage, getExtensionApi, toPosixPath } from "./utility";

export class ExportJarTaskProvider implements TaskProvider {

    public static exportJarType: string = "java";

    public static getTask(stepMetadata: IStepMetadata): Task {
        const targetPathSetting: string = Settings.getExportJarTargetPath();
        const defaultDefinition: IExportJarTaskDefinition = {
            type: ExportJarTaskProvider.exportJarType,
            targetPath: targetPathSetting,
            elements: [],
            mainMethod: undefined,
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
        const stepMetadata: IStepMetadata = {
            entry: undefined,
            workspaceFolder: folder,
            steps: [],
        };
        const resolvedTask: Task = new Task(definition, folder, task.name, ExportJarTaskProvider.exportJarType,
            new CustomExecution(async (resolvedDefinition: TaskDefinition): Promise<Pseudoterminal> => {
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
            const outputList: string[] = [];
            if (_.isEmpty(projectList)) {
                continue;
            } else if (projectList.length === 1) {
                outputList.push("${" + ExportJarProperties.COMPILE_OUTPUT + "}");
                outputList.push("${" + ExportJarProperties.TESTCOMPILE_OUTPUT + "}");
                outputList.push("${" + ExportJarProperties.RUNTIME_DEPENDENCIES + "}");
                outputList.push("${" + ExportJarProperties.TEST_DEPENDENCIES + "}");
            } else {
                for (const project of projectList) {
                    outputList.push("${" + ExportJarProperties.COMPILE_OUTPUT + ":" + project.name + "}");
                    outputList.push("${" + ExportJarProperties.TESTCOMPILE_OUTPUT + ":" + project.name + "}");
                    outputList.push("${" + ExportJarProperties.RUNTIME_DEPENDENCIES + ":" + project.name + "}");
                    outputList.push("${" + ExportJarProperties.TEST_DEPENDENCIES + ":" + project.name + "}");
                }
            }
            const defaultDefinition: IExportJarTaskDefinition = {
                type: ExportJarTaskProvider.exportJarType,
                elements: outputList,
                mainMethod: "",
                targetPath: ExportJarProperties.DEFAULT_OUTPUT_PATH,
            };
            const stepMetadata: IStepMetadata = {
                entry: undefined,
                workspaceFolder: folder,
                projectList: await Jdtls.getProjects(folder.uri.toString()),
                steps: [],
            };
            const defaultTask: Task = new Task(defaultDefinition, folder, "exportjar:" + folder.name,
                ExportJarTaskProvider.exportJarType, new CustomExecution(async (resolvedDefinition: TaskDefinition): Promise<Pseudoterminal> => {
                    return new ExportJarTaskTerminal(resolvedDefinition, stepMetadata);
                }));
            defaultTask.presentationOptions.reveal = TaskRevealKind.Never;
            this.tasks.push(defaultTask);
        }
        return this.tasks;
    }
}

interface IExportJarTaskDefinition extends TaskDefinition {
    elements?: string[];
    mainMethod?: string;
    targetPath?: string;
}

class ExportJarTaskTerminal implements Pseudoterminal {

    public writeEmitter = new EventEmitter<string>();
    public closeEmitter = new EventEmitter<void>();

    public onDidWrite: Event<string> = this.writeEmitter.event;
    public onDidClose?: Event<void> = this.closeEmitter.event;

    private stepMetadata: IStepMetadata;

    constructor(exportJarTaskDefinition: IExportJarTaskDefinition, stepMetadata: IStepMetadata) {
        this.stepMetadata = stepMetadata;
        this.stepMetadata.mainMethod = exportJarTaskDefinition.mainMethod;
        this.stepMetadata.outputPath = exportJarTaskDefinition.targetPath;
        this.stepMetadata.elements = exportJarTaskDefinition.elements;
    }

    public async open(initialDimensions: TerminalDimensions | undefined): Promise<void> {
        if (_.isEmpty(this.stepMetadata.outputPath)) {
            const targetPath = Settings.getExportJarTargetPath();
            this.stepMetadata.outputPath = (targetPath === ExportJarProperties.SETTING_ASKUSER || targetPath === "") ?
                ExportJarProperties.SETTING_ASKUSER : join(this.stepMetadata.workspaceFolder.uri.fsPath, this.stepMetadata.workspaceFolder.name + ".jar");
        }
        try {
            if (!_.isEmpty(this.stepMetadata.elements)) {
                const runtimeClassPathMap: Map<string, string[]> = new Map<string, string[]>();
                const runtimeDependencyMap: Map<string, string[]> = new Map<string, string[]>();
                const testClassPathMap: Map<string, string[]> = new Map<string, string[]>();
                const testDependencyMap: Map<string, string[]> = new Map<string, string[]>();
                const projectList: INodeData[] = await Jdtls.getProjects(this.stepMetadata.workspaceFolder.uri.toString());
                for (const project of projectList) {
                    const runtimeClassPaths: string[] = [];
                    const runtimeDependencies: string[] = [];
                    await this.getClasspaths(project.uri, "runtime", runtimeClassPaths, runtimeDependencies);
                    runtimeClassPathMap.set(project.name, runtimeClassPaths);
                    runtimeDependencyMap.set(project.name, runtimeDependencies);
                    const testClassPaths: string[] = [];
                    const testDependencies: string[] = [];
                    await this.getClasspaths(project.uri, "test", testClassPaths, testDependencies);
                    testClassPathMap.set(project.name, testClassPaths);
                    testDependencyMap.set(project.name, testDependencies);
                }
                this.stepMetadata.classpaths = await this.resolveClassPaths(runtimeClassPathMap,
                    runtimeDependencyMap, testClassPathMap, testDependencyMap);
            }
            await createJarFile(this.stepMetadata);
        } catch (e) {
            // Do nothing
        } finally {
            this.closeEmitter.fire();
        }
    }

    public close(): void {

    }

    private toAbsolute(path: string): string {
        const negative: boolean = (path[0] === "!");
        let positivePath: string = negative ? path.substring(1) : path;
        if (!isAbsolute(positivePath)) {
            positivePath = join(this.stepMetadata.workspaceFolder.uri.fsPath, positivePath);
        }
        return negative ? "!" + positivePath : positivePath;
    }

    private async getClasspaths(projectUri: string, classpathScope: string, classpaths: string[], dependencies: string[]): Promise<void> {
        const extensionApi: any = await getExtensionApi();
        const classpathResult: IClasspathResult = await extensionApi.getClasspaths(projectUri, { scope: classpathScope });
        for (const classpath of classpathResult.classpaths) {
            if (extname(classpath) === ".jar") {
                dependencies.push(classpath);
            } else {
                classpaths.push(classpath);
            }
        }
        for (const classpath of classpathResult.modulepaths) {
            if (extname(classpath) === ".jar") {
                dependencies.push(classpath);
            } else {
                classpaths.push(classpath);
            }
        }
    }

    private async resolveClassPaths(runtimeClassPathMap: Map<string, string[]>,
                                    runtimeDependencyMap: Map<string, string[]>,
                                    testClassPathMap: Map<string, string[]>,
                                    testDependencyMap: Map<string, string[]>): Promise<IClassPath[]> {
        // tslint:disable-next-line: no-invalid-template-strings
        const regExp: RegExp = new RegExp("\\${(.*?)(:.*)?}");
        const classPathArray: string[] = [];
        const dependencies: string[] = [];
        for (const element of this.stepMetadata.elements) {
            if (element.length === 0) {
                continue;
            }
            const matchResult = element.match(regExp);
            if (_.isEmpty(matchResult) || matchResult.length <= 2) {
                classPathArray.push(toPosixPath(normalize(this.toAbsolute(element))));
                continue;
            }
            const projectName: string = (matchResult[2] === undefined) ? undefined : matchResult[2].substring(1);
            switch (matchResult[1]) {
                case ExportJarProperties.RUNTIME_DEPENDENCIES:
                    this.getClassPathFromMap(matchResult, runtimeDependencyMap, dependencies, true, projectName);
                    break;
                case ExportJarProperties.TEST_DEPENDENCIES:
                    this.getClassPathFromMap(matchResult, testDependencyMap, dependencies, true, projectName);
                    break;
                case ExportJarProperties.COMPILE_OUTPUT:
                    this.getClassPathFromMap(matchResult, runtimeClassPathMap, classPathArray, false, projectName);
                    break;
                case ExportJarProperties.TESTCOMPILE_OUTPUT:
                    this.getClassPathFromMap(matchResult, testClassPathMap, classPathArray, false, projectName);
                    break;
            }
        }
        const trie: Trie<IUriData> = new Trie<IUriData>();
        const fsPathArray: string[] = [];
        for (const classPath of classPathArray) {
            if (classPath.length === 0) {
                continue;
            }
            if (classPath[0] !== "!") {
                const uri: Uri = Uri.file(classPath);
                const uriData: IUriData = {
                    uri: uri.toString(),
                };
                fsPathArray.push(toPosixPath(normalize(uri.fsPath)));
                trie.insert(uriData);
            } else {
                fsPathArray.push("!" + toPosixPath(normalize(Uri.file(classPath.substring(1)).fsPath)));
            }
        }
        const globs: string[] = await globby(fsPathArray);
        const sources: IClassPath[] = [];
        for (const glob of globs) {
            const tireNode: TrieNode<IUriData> = trie.find(Uri.file(glob).fsPath, true);
            if (tireNode === undefined) {
                continue;
            }
            let fsPath = toPosixPath(normalize(Uri.parse(tireNode.value.uri).fsPath));
            if (!(await lstat(fsPath)).isDirectory()) {
                fsPath = dirname(fsPath);
            }
            if (!_.isEmpty(tireNode)) {
                const classpath: IClassPath = {
                    source: glob,
                    destination: relative(fsPath, glob),
                    isDependency: false,
                };
                sources.push(classpath);
            }
        }
        for (const dependency of await globby(dependencies)) {
            const classpath: IClassPath = {
                source: dependency,
                destination: undefined,
                isDependency: true,
            };
            sources.push(classpath);
        }
        return sources;
    }

    private getClassPathFromMap(matchResult: RegExpMatchArray, source: Map<string, string[]>, target: string[],
                                isDependency: boolean, projectName: string | undefined): void {
        if (projectName === undefined) {
            for (const value of source.values()) {
                this.assignClassPathFromMap(value, matchResult, target, isDependency);
            }
        } else {
            for (const entries of source.entries()) {
                if (projectName === entries[0]) {
                    this.assignClassPathFromMap(entries[1], matchResult, target, isDependency);
                }
            }
        }
    }

    private assignClassPathFromMap(classPaths: string[], matchResult: RegExpMatchArray, target: string[], isDependency: boolean): void {
        for (const classPath of classPaths) {
            if (isDependency) {
                target.push(toPosixPath(normalize(classPath)));
            } else {
                target.push(this.toAbsolute(matchResult.input.replace(matchResult[0], classPath)));
            }
        }
    }
}

interface IExportJarTaskDefinition extends TaskDefinition {
    elements?: string[];
    mainMethod?: string;
    targetPath?: string;
}
