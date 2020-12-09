// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ensureDir, pathExists } from "fs-extra";
import globby = require("globby");
import * as _ from "lodash";
import { basename, dirname, extname, isAbsolute, join, normalize, relative } from "path";
import { Disposable, ProgressLocation, QuickInputButtons, QuickPickItem, Uri, window, WorkspaceFolder } from "vscode";
import { sendInfo } from "vscode-extension-telemetry-wrapper";
import { Jdtls } from "../java/jdtls";
import { INodeData } from "../java/nodeData";
import { IExportJarStepExecutor } from "./IExportJarStepExecutor";
import { IClasspath, IStepMetadata } from "./IStepMetadata";
import { createPickBox, ExportJarMessages, ExportJarStep, ExportJarTargets, getExtensionApi, saveDialog, toPosixPath } from "./utility";

export class GenerateJarExecutor implements IExportJarStepExecutor {

    private readonly currentStep: ExportJarStep = ExportJarStep.GenerateJar;

    public async execute(stepMetadata: IStepMetadata): Promise<boolean> {
        return this.generateJar(stepMetadata);
    }

    private async generateJar(stepMetadata: IStepMetadata): Promise<boolean> {
        if (_.isEmpty(stepMetadata.elements)) {
            // If the user uses wizard or custom task with a empty list of elements,
            // the classpaths should be specified manually.
            if (!(await this.generateClasspaths(stepMetadata))) {
                return false;
            }
        }
        const folder: WorkspaceFolder | undefined = stepMetadata.workspaceFolder;
        if (!folder) {
            throw new Error(ExportJarMessages.fieldUndefinedMessage(ExportJarMessages.Field.WORKSPACEFOLDER, this.currentStep));
        }
        let destPath = "";
        if (stepMetadata.outputPath === ExportJarTargets.SETTING_ASKUSER || stepMetadata.outputPath === "") {
            if (stepMetadata.outputPath === ExportJarTargets.SETTING_ASKUSER) {
                sendInfo("", { exportJarPath: stepMetadata.outputPath });
            }
            const defaultFileUri: Uri = Uri.file(join(folder.uri.fsPath, `${folder.name}.jar`));
            const outputUri: Uri | undefined = await saveDialog(defaultFileUri, "Generate");
            if (!outputUri) {
                return Promise.reject();
            }
            destPath = outputUri.fsPath;
        } else {
            const outputPath: string | undefined = stepMetadata.outputPath;
            if (!outputPath) {
                throw new Error(ExportJarMessages.fieldUndefinedMessage(ExportJarMessages.Field.OUTPUTPATH, this.currentStep));
            }
            // Both the absolute path and the relative path (to workspace folder) are supported.
            destPath = (isAbsolute(outputPath)) ? outputPath : join(folder.uri.fsPath, outputPath);
            // Since both the specific target folder and the specific target file are supported,
            // we regard a path as a file if it ends with ".jar". Otherwise, it was regarded as a folder.
            if (extname(outputPath) !== ".jar") {
                destPath = join(destPath, folder.name + ".jar");
            }
            await ensureDir(dirname(destPath));
        }
        destPath = normalize(destPath);
        return window.withProgress({
            location: ProgressLocation.Window,
            title: "Exporting Jar : Generating jar...",
            cancellable: true,
        }, (_progress, token) => {
            return new Promise<boolean>(async (resolve, reject) => {
                token.onCancellationRequested(() => {
                    return reject();
                });
                const mainClass: string | undefined = stepMetadata.mainClass;
                // For "no main class" option, we get an empty string in stepMetadata.mainClass,
                // so this condition would be (mainClass === undefined)
                if (mainClass === undefined) {
                    return reject(new Error(ExportJarMessages.fieldUndefinedMessage(ExportJarMessages.Field.MAINCLASS, this.currentStep)));
                }
                const classpaths: IClasspath[] = stepMetadata.classpaths;
                if (_.isEmpty(classpaths)) {
                    return reject(new Error(ExportJarMessages.CLASSPATHS_EMPTY));
                }
                const exportResult: IExportResult = await Jdtls.exportJar(basename(mainClass), classpaths, destPath);
                if (exportResult.result === true) {
                    stepMetadata.outputPath = destPath;
                    return resolve(true);
                } else {
                    return reject(new Error("Export jar failed." + exportResult.message));
                }
            });
        });
    }

    private async generateClasspaths(stepMetadata: IStepMetadata): Promise<boolean> {
        const extensionApi: any = await getExtensionApi();
        const dependencyItems: IJarQuickPickItem[] = await window.withProgress({
            location: ProgressLocation.Window,
            title: "Exporting Jar : Resolving classpaths...",
            cancellable: true,
        }, (_progress, token) => {
            return new Promise<IJarQuickPickItem[]>(async (resolve, reject) => {
                token.onCancellationRequested(() => {
                    return reject();
                });
                const pickItems: IJarQuickPickItem[] = [];
                const uriSet: Set<string> = new Set<string>();
                const projectList: INodeData[] = stepMetadata.projectList;
                if (_.isEmpty(projectList)) {
                    return reject(new Error(ExportJarMessages.WORKSPACE_EMPTY));
                }
                const workspaceFolder: WorkspaceFolder | undefined = stepMetadata.workspaceFolder;
                if (!workspaceFolder) {
                    return reject(new Error(ExportJarMessages.fieldUndefinedMessage(ExportJarMessages.Field.WORKSPACEFOLDER, this.currentStep)));
                }
                for (const project of projectList) {
                    const classpaths: IClasspathResult = await extensionApi.getClasspaths(project.uri, { scope: "runtime" });
                    pickItems.push(
                        ...await this.parseDependencyItems(classpaths.classpaths, uriSet, workspaceFolder.uri.fsPath, "runtime"),
                        ...await this.parseDependencyItems(classpaths.modulepaths, uriSet, workspaceFolder.uri.fsPath, "runtime"));
                    const testClasspaths: IClasspathResult = await extensionApi.getClasspaths(project.uri, { scope: "test" });
                    pickItems.push(
                        ...await this.parseDependencyItems(testClasspaths.classpaths, uriSet, workspaceFolder.uri.fsPath, "test"),
                        ...await this.parseDependencyItems(testClasspaths.modulepaths, uriSet, workspaceFolder.uri.fsPath, "test"));
                }
                return resolve(pickItems);
            });
        });
        if (_.isEmpty(dependencyItems)) {
            throw new Error(ExportJarMessages.PROJECT_EMPTY);
        } else if (dependencyItems.length === 1) {
            await this.setStepMetadataFromOutputFolder(dependencyItems[0].path, stepMetadata.classpaths);
            return true;
        }
        dependencyItems.sort((node1, node2) => {
            if (node1.description !== node2.description) {
                return (node1.description || "").localeCompare(node2.description || "");
            }
            if (node1.type !== node2.type) {
                return node2.type.localeCompare(node1.type);
            }
            return node1.label.localeCompare(node2.label);
        });
        const pickedDependencyItems: IJarQuickPickItem[] = [];
        for (const item of dependencyItems) {
            if (item.picked) {
                pickedDependencyItems.push(item);
            }
        }
        const disposables: Disposable[] = [];
        let result: boolean = false;
        try {
            result = await new Promise<boolean>(async (resolve, reject) => {
                const pickBox = createPickBox<IJarQuickPickItem>("Export Jar : Determine elements", "Select the elements",
                    dependencyItems, stepMetadata.steps.length > 0, true);
                pickBox.selectedItems = pickedDependencyItems;
                disposables.push(
                    pickBox.onDidTriggerButton((item) => {
                        if (item === QuickInputButtons.Back) {
                            return resolve(false);
                        }
                    }),
                    pickBox.onDidAccept(async () => {
                        if (_.isEmpty(pickBox.selectedItems)) {
                            return;
                        }
                        for (const item of pickBox.selectedItems) {
                            if (item.type === "artifact") {
                                const classpath: IClasspath = {
                                    source: item.path,
                                    destination: undefined,
                                    isArtifact: true,
                                };
                                stepMetadata.classpaths.push(classpath);
                            } else {
                                await this.setStepMetadataFromOutputFolder(item.path, stepMetadata.classpaths);
                            }
                        }
                        return resolve(true);
                    }),
                    pickBox.onDidHide(() => {
                        return reject();
                    }),
                );
                disposables.push(pickBox);
                pickBox.show();
            });
        } finally {
            for (const d of disposables) {
                d.dispose();
            }
        }
        return result;
    }

    private async setStepMetadataFromOutputFolder(folderPath: string, classpaths: IClasspath[]): Promise<void> {
        const posixPath: string = toPosixPath(folderPath);
        for (const path of await globby(posixPath)) {
            const classpath: IClasspath = {
                source: path,
                destination: relative(posixPath, path),
                isArtifact: false,
            };
            classpaths.push(classpath);
        }
    }

    private async parseDependencyItems(paths: string[], uriSet: Set<string>, projectPath: string, scope: string): Promise<IJarQuickPickItem[]> {
        const dependencyItems: IJarQuickPickItem[] = [];
        for (const classpath of paths) {
            if (await pathExists(classpath) === false) {
                continue;
            }
            const extName = extname(classpath);
            const baseName = Uri.parse(classpath).fsPath.startsWith(Uri.parse(projectPath).fsPath) ?
                relative(projectPath, classpath) : basename(classpath);
            const typeValue = (extName === ".jar") ? "artifact" : "outputFolder";
            if (!uriSet.has(classpath)) {
                uriSet.add(classpath);
                dependencyItems.push({
                    label: baseName,
                    description: scope,
                    path: classpath,
                    type: typeValue,
                    picked: scope === "runtime",
                });
            }
        }
        return dependencyItems;
    }

}

export interface IClasspathResult {
    projectRoot: string;
    classpaths: string[];
    modulepaths: string[];
}

interface IJarQuickPickItem extends QuickPickItem {
    path: string;
    type: string;
}

export interface IExportResult {
    result: boolean;
    message: string;
    log?: string;
}
