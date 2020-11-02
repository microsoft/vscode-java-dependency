// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { lstat } from "fs-extra";
import * as globby from "globby";
import * as _ from "lodash";
import { platform } from "os";
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
import { ExportJarConstants, ExportJarTargets, failMessage, getExtensionApi, toPosixPath, toWinPath } from "./utility";

interface IExportJarTaskDefinition extends TaskDefinition {
    elements?: string[];
    mainMethod?: string;
    targetPath?: string;
}

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
            projectList: await Jdtls.getProjects(folder.uri.toString()),
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
            const elementList: string[] = [];
            if (_.isEmpty(projectList)) {
                continue;
            } else if (projectList.length === 1) {
                elementList.push("${" + ExportJarConstants.COMPILE_OUTPUT + "}",
                    "${" + ExportJarConstants.TESTCOMPILE_OUTPUT + "}",
                    "${" + ExportJarConstants.RUNTIME_DEPENDENCIES + "}",
                    "${" + ExportJarConstants.TEST_DEPENDENCIES + "}");
            } else {
                for (const project of projectList) {
                    elementList.push("${" + ExportJarConstants.COMPILE_OUTPUT + ":" + project.name + "}",
                        "${" + ExportJarConstants.TESTCOMPILE_OUTPUT + ":" + project.name + "}",
                        "${" + ExportJarConstants.RUNTIME_DEPENDENCIES + ":" + project.name + "}",
                        "${" + ExportJarConstants.TEST_DEPENDENCIES + ":" + project.name + "}");
                }
            }
            const defaultDefinition: IExportJarTaskDefinition = {
                type: ExportJarTaskProvider.exportJarType,
                elements: elementList,
                mainMethod: "",
                targetPath: ExportJarTargets.DEFAULT_OUTPUT_PATH,
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
        try {
            if (!_.isEmpty(this.stepMetadata.elements)) {
                const runtimeClassPathMap: Map<string, string[]> = new Map<string, string[]>();
                const runtimeDependencyMap: Map<string, string[]> = new Map<string, string[]>();
                const testClassPathMap: Map<string, string[]> = new Map<string, string[]>();
                const testDependencyMap: Map<string, string[]> = new Map<string, string[]>();
                const projectList: INodeData[] = await Jdtls.getProjects(this.stepMetadata.workspaceFolder.uri.toString());
                for (const project of projectList) {
                    await this.setClasspathMap(project, "runtime", runtimeClassPathMap, runtimeDependencyMap);
                    await this.setClasspathMap(project, "test", testClassPathMap, testDependencyMap);
                }
                this.stepMetadata.classpaths = await this.resolveClassPaths(runtimeClassPathMap,
                    runtimeDependencyMap, testClassPathMap, testDependencyMap);
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

    private toAbsolutePosixPath(path: string): string {
        const negative: boolean = (path[0] === "!");
        let positivePath: string = negative ? path.substring(1) : path;
        if (!isAbsolute(positivePath)) {
            positivePath = join(this.stepMetadata.workspaceFolder.uri.fsPath, positivePath);
        }
        positivePath = toPosixPath(positivePath);
        return negative ? "!" + positivePath : positivePath;
    }

    private async setClasspathMap(project: INodeData, classpathScope: string,
                                  classPathMap: Map<string, string[]>, dependencyMap: Map<string, string[]>): Promise<void> {
        const extensionApi: any = await getExtensionApi();
        const classpathResult: IClasspathResult = await extensionApi.getClasspaths(project.uri, { scope: classpathScope });
        const classPaths: string[] = [];
        const dependencies: string[] = [];
        for (const classpath of classpathResult.classpaths) {
            if (extname(classpath) === ".jar") {
                dependencies.push(classpath);
            } else {
                classPaths.push(classpath);
            }
        }
        for (const classpath of classpathResult.modulepaths) {
            if (extname(classpath) === ".jar") {
                dependencies.push(classpath);
            } else {
                classPaths.push(classpath);
            }
        }
        classPathMap.set(project.name, classPaths);
        dependencyMap.set(project.name, dependencies);
    }

    private async resolveClassPaths(runtimeClassPathMap: Map<string, string[]>,
                                    runtimeDependencyMap: Map<string, string[]>,
                                    testClassPathMap: Map<string, string[]>,
                                    testDependencyMap: Map<string, string[]>): Promise<IClassPath[]> {
        // tslint:disable-next-line: no-invalid-template-strings
        const regExp: RegExp = new RegExp("\\${(.*?)(:.*)?}");
        let classPathArray: string[] = [];
        let dependencies: string[] = [];
        for (const element of this.stepMetadata.elements) {
            if (element.length === 0) {
                continue;
            }
            const matchResult = element.match(regExp);
            if (_.isEmpty(matchResult) || matchResult.length <= 2) {
                classPathArray.push(this.toAbsolutePosixPath(element));
                continue;
            }
            const projectName: string = (matchResult[2] === undefined) ? undefined : matchResult[2].substring(1);
            switch (matchResult[1]) {
                case ExportJarConstants.RUNTIME_DEPENDENCIES:
                    dependencies = dependencies.concat(this.getClassPathFromMap(matchResult, runtimeDependencyMap, projectName));
                    break;
                case ExportJarConstants.TEST_DEPENDENCIES:
                    dependencies = dependencies.concat(this.getClassPathFromMap(matchResult, testDependencyMap, projectName));
                    break;
                case ExportJarConstants.COMPILE_OUTPUT:
                    classPathArray = classPathArray.concat(this.getClassPathFromMap(matchResult, runtimeClassPathMap, projectName));
                    break;
                case ExportJarConstants.TESTCOMPILE_OUTPUT:
                    classPathArray = classPathArray.concat(this.getClassPathFromMap(matchResult, testClassPathMap, projectName));
                    break;
            }
        }
        const trie: Trie<IUriData> = new Trie<IUriData>();
        const fsPathArray: string[] = [];
        for (const classPath of classPathArray) {
            if (classPath.length === 0) {
                continue;
            }
            if (classPath[0] === "!") {
                fsPathArray.push("!" + classPath.substring(1));
                continue;
            }
            const uri: Uri = Uri.file(platform() === "win32" ? toWinPath(classPath) : classPath);
            const uriData: IUriData = {
                uri: uri.toString(),
            };
            trie.insert(uriData);
            fsPathArray.push(classPath);
        }
        const sources: IClassPath[] = [];
        for (const glob of await globby(fsPathArray)) {
            const tireNode: TrieNode<IUriData> = trie.find(Uri.file(platform() === "win32" ? toWinPath(glob) : glob).fsPath, true);
            if (tireNode === undefined) {
                continue;
            }
            let fsPath = Uri.parse(tireNode.value.uri).fsPath;
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

    private getClassPathFromMap(matchResult: RegExpMatchArray, source: Map<string, string[]>, projectName: string | undefined): string[] {
        const result: string[] = [];
        if (projectName !== undefined) {
            for (const classPath of source.get(projectName)) {
                result.push(this.toAbsolutePosixPath(matchResult.input.replace(matchResult[0], classPath)));
            }
        } else {
            for (const value of source.values()) {
                for (const classPath of value) {
                    result.push(this.toAbsolutePosixPath(matchResult.input.replace(matchResult[0], classPath)));
                }
            }
        }
        return result;
    }

}
