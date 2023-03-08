// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { lstat } from "fs-extra";
import { globby } from "globby";
import * as _ from "lodash";
import { platform } from "os";
import { dirname, extname, isAbsolute, join, relative } from "path";
import {
    CancellationToken,
    CustomExecution, Event, EventEmitter, ProviderResult, Pseudoterminal, Task, TaskDefinition,
    TaskProvider, TaskRevealKind, tasks, TerminalDimensions, Uri, workspace, WorkspaceFolder,
} from "vscode";
import { sendInfo } from "vscode-extension-telemetry-wrapper";
import { buildWorkspace } from "../../build";
import { Jdtls } from "../../java/jdtls";
import { INodeData } from "../../java/nodeData";
import { languageServerApiManager } from "../../languageServerApi/languageServerApiManager";
import { Settings } from "../../settings";
import { IUriData, Trie, TrieNode } from "../../views/nodeCache/Trie";
import { IClasspathResult } from "./GenerateJarExecutor";
import { IExportJarStepExecutor } from "./IExportJarStepExecutor";
import { IClasspath, IStepMetadata } from "./IStepMetadata";
import { IMainClassInfo } from "./ResolveMainClassExecutor";
import {
    ExportJarConstants, ExportJarMessages, ExportJarStep, failMessage, getExtensionApi,
    resetStepMetadata, revealTerminal, stepMap, successMessage, toPosixPath, toWinPath,
} from "./utility";

interface IExportJarTaskDefinition extends TaskDefinition {
    label?: string;
    mainClass?: string;
    targetPath?: string;
    elements?: string[];
}

let isExportingJar: boolean = false;
// key: terminalId, value: ExportJarTaskTerminal
const activeTerminalMap: Map<string, ExportJarTaskTerminal> = new Map<string, ExportJarTaskTerminal>();

export async function executeExportJarTask(node?: INodeData): Promise<void> {
    // save the workspace first
    await workspace.saveAll(false /*includeUntitled*/);

    if (!await languageServerApiManager.ready() || isExportingJar || await buildWorkspace() === false) {
        return;
    }
    isExportingJar = true;
    const stepMetadata: IStepMetadata = {
        entry: node,
        taskLabel: "default",
        steps: [],
        projectList: [],
        elements: [],
        classpaths: [],
    };
    try {
        const resolveJavaProjectExecutor: IExportJarStepExecutor | undefined = stepMap.get(ExportJarStep.ResolveJavaProject);
        if (!resolveJavaProjectExecutor) {
            throw new Error(ExportJarMessages.stepErrorMessage(ExportJarMessages.StepAction.FINDEXECUTOR, ExportJarStep.ResolveJavaProject));
        }
        await resolveJavaProjectExecutor.execute(stepMetadata);
        tasks.executeTask(BuildArtifactTaskProvider.getDefaultTask(stepMetadata));
    } catch (err) {
        if (err) {
            failMessage(`${err}`);
        }
        isExportingJar = false;
        return;
    }
}
export class BuildArtifactTaskProvider implements TaskProvider {

    public static exportJarType: string = "java (buildArtifact)";

    public static getDefaultTask(stepMetadata: IStepMetadata): Task {
        if (!stepMetadata.workspaceFolder) {
            throw new Error(ExportJarMessages.fieldUndefinedMessage(ExportJarMessages.Field.WORKSPACEFOLDER, ExportJarStep.ResolveTask));
        }
        const defaultDefinition: IExportJarTaskDefinition = {
            type: BuildArtifactTaskProvider.exportJarType,
            label: "default",
            targetPath: Settings.getExportJarTargetPath(),
            elements: [],
            mainClass: undefined,
        };
        const task: Task = new Task(defaultDefinition, stepMetadata.workspaceFolder, "default", BuildArtifactTaskProvider.exportJarType,
            new CustomExecution(async (resolvedDefinition: TaskDefinition): Promise<Pseudoterminal> => {
                return new ExportJarTaskTerminal(resolvedDefinition, stepMetadata);
            }));
        task.presentationOptions.reveal = TaskRevealKind.Never;
        return task;
    }

    private tasks: Task[] | undefined;

    public async resolveTask(task: Task): Promise<Task> {
        return BuildArtifactTaskProvider.resolveExportTask(task, BuildArtifactTaskProvider.exportJarType);
    }

    public static async resolveExportTask(task: Task, type: string): Promise<Task> {
        if (!await languageServerApiManager.isReady(1000)) {
            return task;
        }
        const definition: IExportJarTaskDefinition = <IExportJarTaskDefinition>task.definition;
        const folder: WorkspaceFolder = <WorkspaceFolder>task.scope;
        try {
            const projectList = await Jdtls.getProjects(folder.uri.toString());
            const resolvedTask: Task = new Task(definition, folder, task.name, type,
                new CustomExecution(async (resolvedDefinition: IExportJarTaskDefinition): Promise<Pseudoterminal> => {
                    const stepMetadata: IStepMetadata = {
                        entry: undefined,
                        taskLabel: resolvedDefinition.label || folder.name,
                        workspaceFolder: folder,
                        projectList: projectList,
                        steps: [],
                        elements: [],
                        classpaths: [],
                    };
                    return new ExportJarTaskTerminal(resolvedDefinition, stepMetadata);
                }));
            resolvedTask.presentationOptions.reveal = TaskRevealKind.Never;
            return resolvedTask;
        } catch (e) {
            return task;
        }
    }

    public async provideTasks(): Promise<Task[] | undefined> {
        if (!await languageServerApiManager.isReady(1000)) {
            return undefined;
        }
        const folders: readonly WorkspaceFolder[] = workspace.workspaceFolders || [];
        if (_.isEmpty(folders)) {
            return undefined;
        }
        if (!_.isEmpty(this.tasks)) {
            return this.tasks;
        }
        this.tasks = [];
        for (const folder of folders) {
            try {
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
                    type: BuildArtifactTaskProvider.exportJarType,
                    mainClass: (mainClasses.length === 1) ? mainClasses[0].name : undefined,
                    targetPath: Settings.getExportJarTargetPath(),
                    elements: elementList,
                };
                const defaultTask: Task = new Task(defaultDefinition, folder, folder.name, BuildArtifactTaskProvider.exportJarType,
                    new CustomExecution(async (resolvedDefinition: IExportJarTaskDefinition): Promise<Pseudoterminal> => {
                        const stepMetadata: IStepMetadata = {
                            entry: undefined,
                            taskLabel: resolvedDefinition.label || folder.name,
                            workspaceFolder: folder,
                            projectList: projectList,
                            steps: [],
                            elements: [],
                            classpaths: [],
                        };
                        return new ExportJarTaskTerminal(resolvedDefinition, stepMetadata);
                    }), undefined);
                defaultTask.presentationOptions.reveal = TaskRevealKind.Never;
                this.tasks.push(defaultTask);
            } catch (e) {
                continue;
            }
        }
        return this.tasks;
    }
}

export class DeprecatedExportJarTaskProvider implements TaskProvider {

    public static type: string = "java";

    provideTasks(_token: CancellationToken): ProviderResult<Task[]> {
        return [];
    }

    resolveTask(task: Task, _token: CancellationToken): ProviderResult<Task> {
        sendInfo("", { name: "resolve-deprecated-export-task" });
        return BuildArtifactTaskProvider.resolveExportTask(task, DeprecatedExportJarTaskProvider.type);
    }

}

class ExportJarTaskTerminal implements Pseudoterminal {

    public writeEmitter = new EventEmitter<string>();
    public closeEmitter = new EventEmitter<number>();

    public onDidWrite: Event<string> = this.writeEmitter.event;
    public onDidClose?: Event<number> = this.closeEmitter.event;

    public terminalId: string;
    private stepMetadata: IStepMetadata;

    constructor(exportJarTaskDefinition: IExportJarTaskDefinition, stepMetadata: IStepMetadata) {
        this.stepMetadata = stepMetadata;
        this.stepMetadata.taskLabel = exportJarTaskDefinition.label || "";
        this.stepMetadata.terminalId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString();
        this.stepMetadata.mainClass = exportJarTaskDefinition.mainClass;
        this.stepMetadata.outputPath = exportJarTaskDefinition.targetPath;
        this.stepMetadata.elements = exportJarTaskDefinition.elements || [];
        this.terminalId = this.stepMetadata.terminalId;
    }

    public exit(message?: string) {
        if (message) {
            this.writeEmitter.fire(message + "\r\n");
        }
        if (activeTerminalMap.has(this.terminalId)) {
            activeTerminalMap.delete(this.terminalId);
            this.closeEmitter.fire(0);
        }
    }

    public async open(_initialDimensions: TerminalDimensions | undefined): Promise<void> {
        activeTerminalMap.set(this.terminalId, this);
        revealTerminal(this.stepMetadata.taskLabel);
        let exportResult: boolean | undefined;
        try {
            if (!this.stepMetadata.workspaceFolder) {
                throw new Error(ExportJarMessages.fieldUndefinedMessage(ExportJarMessages.Field.WORKSPACEFOLDER, ExportJarStep.ResolveTask));
            }
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
            exportResult = await this.createJarFile(this.stepMetadata);
        } catch (err) {
            if (err) {
                failMessage(`${err}`);
                this.exit("[ERROR] An error occurs during export Jar process");
            } else {
                this.exit("[CANCEL] Export Jar process is cancelled by user");
            }
        } finally {
            isExportingJar = false;
            if (exportResult === true) {
                successMessage(this.stepMetadata.outputPath);
                this.exit("[SUCCESS] Export Jar process is finished successfully");
            } else if (exportResult === false) {
                // We call `executeExportJarTask()` with the same entry here
                // to help the user reselect the Java project.
                executeExportJarTask(this.stepMetadata.entry);
            }
            this.exit();
        }
    }

    public close(): void {

    }

    private async createJarFile(stepMetadata: IStepMetadata): Promise<boolean> {
        let step: ExportJarStep = ExportJarStep.ResolveJavaProject;
        let previousStep: ExportJarStep | undefined;
        let executor: IExportJarStepExecutor | undefined;
        while (step !== ExportJarStep.Finish) {
            executor = stepMap.get(step);
            if (!executor) {
                throw new Error(ExportJarMessages.stepErrorMessage(ExportJarMessages.StepAction.FINDEXECUTOR, step));
            }
            if (!await executor.execute(stepMetadata)) {
                // Go back
                previousStep = stepMetadata.steps.pop();
                if (!previousStep) {
                    throw new Error(ExportJarMessages.stepErrorMessage(ExportJarMessages.StepAction.GOBACK, step));
                }
                resetStepMetadata(previousStep, stepMetadata);
                step = previousStep;
            } else {
                // Go ahead
                switch (step) {
                    case ExportJarStep.ResolveJavaProject:
                        step = ExportJarStep.ResolveMainClass;
                        break;
                    case ExportJarStep.ResolveMainClass:
                        step = ExportJarStep.GenerateJar;
                        break;
                    case ExportJarStep.GenerateJar:
                        step = ExportJarStep.Finish;
                        break;
                    default:
                        throw new Error(ExportJarMessages.stepErrorMessage(ExportJarMessages.StepAction.GOAHEAD, step));
                }
            }
            if (step === ExportJarStep.ResolveJavaProject) {
                // It's possible for a user who comes back to the step selecting the Java project to change the workspace.
                // Since a specific task corresponds to a specific workspace, we return "false" as a mark.
                return false;
            }
        }
        return true;
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
            const matchResult: RegExpMatchArray | null = element.match(regExp);
            if (matchResult === null || _.isEmpty(matchResult) || matchResult.length <= 2) {
                if (extname(element) === ".jar") {
                    artifacts.push(this.toAbsolutePosixPath(element));
                } else {
                    outputElements.push(this.toAbsolutePosixPath(element));
                }
                continue;
            }
            const projectName: string | undefined = matchResult[2]?.substring(1);
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
            const tireNode: TrieNode<IUriData | undefined> | undefined = trie.find(
                Uri.file(platform() === "win32" ? toWinPath(glob) : glob).fsPath, /* returnEarly = */true);
            if (!tireNode?.value?.uri) {
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
        if (!matchResult.input) {
            return result;
        }
        if (projectName !== undefined) {
            const entries: string[] = rawClasspathEntries.get(projectName) || [];
            if (_.isEmpty(entries)) {
                return result;
            }
            for (const classpath of entries) {
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
        if (!this.stepMetadata.workspaceFolder) {
            throw new Error(ExportJarMessages.fieldUndefinedMessage(ExportJarMessages.Field.WORKSPACEFOLDER, ExportJarStep.ResolveTask));
        }
        const negative: boolean = (path[0] === "!");
        let positivePath: string = negative ? path.substring(1) : path;
        if (!isAbsolute(positivePath)) {
            positivePath = join(this.stepMetadata.workspaceFolder.uri.fsPath, positivePath);
        }
        positivePath = toPosixPath(positivePath);
        return negative ? "!" + positivePath : positivePath;
    }
}

export function appendOutput(terminalId: string, message: string): void {
    const terminal = activeTerminalMap.get(terminalId);
    if (!terminal) {
        return;
    }
    terminal.writeEmitter.fire(message + "\r\n");
}
