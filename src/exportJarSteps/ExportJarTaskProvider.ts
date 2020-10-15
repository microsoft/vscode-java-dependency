// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as globby from "globby";
import _ = require("lodash");
import { extname, isAbsolute, join } from "path";
import * as upath from "upath";
import {
    CustomExecution, Disposable, Event, EventEmitter, Extension, extensions, Pseudoterminal, Task, TaskDefinition,
    TaskProvider, TaskRevealKind, tasks, TaskScope, TerminalDimensions, Uri, workspace, WorkspaceFolder,
} from "vscode";
import { createJarFile } from "../exportJarFileCommand";
import { Jdtls } from "../java/jdtls";
import { INodeData } from "../java/nodeData";
import { Settings } from "../settings";
import { IClasspathResult } from "./GenerateJarExecutor";
import { IClassPaths, IStepMetadata } from "./IStepMetadata";
import { PathTrie } from "./PathTrie";
import { COMPILE_OUTPUT, DEFAULT_OUTPUT_PATH, RUNTIME_DEPENDENCIES, SETTING_ASKUSER, TEST_DEPENDENCIES, TESTCOMPILE_OUTPUT } from "./utility";

export class ExportJarTaskProvider implements TaskProvider {

    public static exportJarType: string = "java";

    public static setProvider(): void {
        ExportJarTaskProvider.exportJarTaskProvider = tasks.registerTaskProvider(ExportJarTaskProvider.exportJarType, new ExportJarTaskProvider());
    }

    public static getProvider(): Disposable | undefined {
        return ExportJarTaskProvider.exportJarTaskProvider;
    }

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

    private static exportJarTaskProvider: Disposable | undefined;

    private tasks: Task[] | undefined;

    public async resolveTask(_task: Task): Promise<Task> {
        const definition: IExportJarTaskDefinition = <IExportJarTaskDefinition>_task.definition;
        const folder: WorkspaceFolder = <WorkspaceFolder>_task.scope;
        const stepMetadata: IStepMetadata = {
            entry: undefined,
            workspaceFolder: folder,
            steps: [],
        };
        const task: Task = new Task(definition, folder, _task.name, ExportJarTaskProvider.exportJarType,
            new CustomExecution(async (resolvedDefinition: TaskDefinition): Promise<Pseudoterminal> => {
                return new ExportJarTaskTerminal(resolvedDefinition, stepMetadata);
            }));
        task.presentationOptions.reveal = TaskRevealKind.Never;
        return task;
    }

    public async provideTasks(): Promise<Task[]> {
        if (this.tasks !== undefined) {
            return this.tasks;
        }
        this.tasks = [];
        for (const folder of workspace.workspaceFolders) {
            const projectList: INodeData[] = await Jdtls.getProjects(folder.uri.toString());
            const outputList: string[] = [];
            if (_.isEmpty(projectList)) {
                continue;
            } else if (projectList.length === 1) {
                outputList.push("${" + COMPILE_OUTPUT + "}");
                outputList.push("${" + TESTCOMPILE_OUTPUT + "}");
            } else {
                for (const project of projectList) {
                    outputList.push("${" + COMPILE_OUTPUT + ":" + project.name + "}");
                    outputList.push("${" + TESTCOMPILE_OUTPUT + ":" + project.name + "}");
                }
            }
            outputList.push("${" + RUNTIME_DEPENDENCIES + "}");
            outputList.push("${" + TEST_DEPENDENCIES + "}");
            const defaultDefinition: IExportJarTaskDefinition = {
                type: ExportJarTaskProvider.exportJarType,
                elements: outputList,
                mainMethod: "",
                targetPath: DEFAULT_OUTPUT_PATH,
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
            // Only for custom task
            this.stepMetadata.outputPath = (Settings.getExportJarTargetPath() === SETTING_ASKUSER) ?
                SETTING_ASKUSER : join(this.stepMetadata.workspaceFolder.uri.fsPath, this.stepMetadata.workspaceFolder.name + ".jar");
        }
        if (!_.isEmpty(this.stepMetadata.elements)) {
            const classPathMap: Map<string, string[]> = new Map<string, string[]>();
            const testClassPathMap: Map<string, string[]> = new Map<string, string[]>();
            const runtimeDependencies: string[] = [];
            const testDependencies: string[] = [];
            const projectList: INodeData[] = await Jdtls.getProjects(this.stepMetadata.workspaceFolder.uri.toString());
            for (const project of projectList) {
                const runtimeClassPaths: string[] = [];
                await this.getClasspaths(project.uri, "runtime", runtimeClassPaths, runtimeDependencies);
                classPathMap.set(project.name, runtimeClassPaths);
                const testClassPaths: string[] = [];
                await this.getClasspaths(project.uri, "test", testClassPaths, testDependencies);
                testClassPathMap.set(project.name, testClassPaths);
            }
            this.stepMetadata.classpaths = await this.resolveClassPaths(runtimeDependencies, testDependencies, classPathMap, testClassPathMap);
        }
        await createJarFile(this.stepMetadata);
        this.closeEmitter.fire();
    }

    public close(): void {

    }

    private toAbsolute(path: string): string {
        if (path.length > 0 && path[0] === "!") {
            const realPath = path.substring(1);
            if (!isAbsolute(realPath)) {
                return "!" + join(this.stepMetadata.workspaceFolder.uri.fsPath, realPath);
            }
        } else {
            if (!isAbsolute(path)) {
                return join(this.stepMetadata.workspaceFolder.uri.fsPath, path);
            }
        }
        return path;
    }

    private async getClasspaths(projectUri: string, _scope: string, classpaths: string[], dependencies: string[]): Promise<void> {
        const extension: Extension<any> | undefined = extensions.getExtension("redhat.java");
        const extensionApi: any = await extension?.activate();
        const classpathResult: IClasspathResult = await extensionApi.getClasspaths(projectUri, { scope: _scope });
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

    private async resolveClassPaths(runtimeDependencies: string[], testDependencies: string[],
                                    classPathMap: Map<string, string[]>, testClassPathMap: Map<string, string[]>): Promise<IClassPaths[]> {
        // tslint:disable-next-line: no-invalid-template-strings
        const regExp: RegExp = new RegExp("\\${(.*)}");
        const classPathArray: string[] = [];
        const dependencies: string[] = [];
        for (const element of this.stepMetadata.elements) {
            const variableResult = element.match(regExp);
            if (_.isEmpty(variableResult) || variableResult.length <= 1) {
                classPathArray.push(upath.normalizeSafe(this.toAbsolute(element)));
                continue;
            }
            if (variableResult[1] === RUNTIME_DEPENDENCIES) {
                for (const dependency of runtimeDependencies) {
                    dependencies.push(upath.normalizeSafe(dependency));
                }
            } else if (variableResult[1] === TEST_DEPENDENCIES) {
                for (const dependency of testDependencies) {
                    dependencies.push(upath.normalizeSafe(dependency));
                }
            } else {
                const splitResult: string[] = variableResult[1].split(":");
                if (splitResult[0] === COMPILE_OUTPUT) {
                    if (splitResult.length === 1) {
                        for (const values of classPathMap.values()) {
                            for (const value of values) {
                                classPathArray.push(this.toAbsolute(variableResult.input.replace(variableResult[0], value)));
                            }
                        }
                    } else if (splitResult.length === 2) {
                        for (const entry of classPathMap.entries()) {
                            if (entry[0] === splitResult[1]) {
                                for (const value of entry[1]) {
                                    classPathArray.push(this.toAbsolute(variableResult.input.replace(variableResult[0], value)));
                                }
                            }
                        }
                    }
                } else if (splitResult[0] === TESTCOMPILE_OUTPUT) {
                    if (splitResult.length === 1) {
                        for (const values of testClassPathMap.values()) {
                            for (const value of values) {
                                classPathArray.push(this.toAbsolute(variableResult.input.replace(variableResult[0], value)));
                            }
                        }
                    } else if (splitResult.length === 2) {
                        for (const entry of testClassPathMap.entries()) {
                            if (entry[0] === splitResult[1]) {
                                for (const value of entry[1]) {
                                    classPathArray.push(this.toAbsolute(variableResult.input.replace(variableResult[0], value)));
                                }
                            }
                        }
                    }
                }
            }
        }
        const trie: PathTrie = new PathTrie();
        const fsPathArray: string[] = [];
        for (const classPath of classPathArray) {
            if (classPath.length > 0 && classPath[0] !== "!") {
                const fsPathPosix = upath.normalizeSafe(Uri.file(classPath).fsPath);
                fsPathArray.push(fsPathPosix);
                trie.insert(fsPathPosix);
            } else {
                const realPath = classPath.substring(1);
                fsPathArray.push("!" + upath.normalizeSafe(Uri.file(realPath).fsPath));
            }
        }
        const globs: string[] = await globby(fsPathArray);
        const sources: IClassPaths[] = [];
        for (const glob of globs) {
            const tireResult: string = trie.find(Uri.file(glob).fsPath);
            if (!_.isEmpty(tireResult)) {
                const classpath: IClassPaths = {
                    source: glob,
                    destination: glob.substring(tireResult.length + 1),
                    isExtract: false,
                };
                sources.push(classpath);
            }
        }
        for (const dependency of await globby(dependencies)) {
            const classpath: IClassPaths = {
                source: dependency,
                destination: undefined,
                isExtract: true,
            };
            sources.push(classpath);
        }
        return sources;
    }

}

interface IExportJarTaskDefinition extends TaskDefinition {
    elements?: string[];
    mainMethod?: string;
    targetPath?: string;
}
