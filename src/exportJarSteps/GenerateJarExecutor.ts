// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ensureDir, pathExists } from "fs-extra";
import globby = require("globby");
import * as _ from "lodash";
import { basename, dirname, extname, isAbsolute, join, normalize, relative } from "path";
import { Disposable, ProgressLocation, QuickInputButtons, QuickPickItem, Uri, window } from "vscode";
import { sendInfo } from "vscode-extension-telemetry-wrapper";
import { ExportJarStep } from "../exportJarFileCommand";
import { Jdtls } from "../java/jdtls";
import { IExportJarStepExecutor } from "./IExportJarStepExecutor";
import { IClassPath, IStepMetadata } from "./IStepMetadata";
import { createPickBox, ExportJarTargets, getExtensionApi, resetStepMetadata, saveDialog, toPosixPath } from "./utility";

export class GenerateJarExecutor implements IExportJarStepExecutor {

    public getNextStep(): ExportJarStep {
        return ExportJarStep.Finish;
    }

    public async execute(stepMetadata: IStepMetadata): Promise<ExportJarStep> {
        if (await this.generateJar(stepMetadata)) {
            return this.getNextStep();
        }
        const lastStep: ExportJarStep = stepMetadata.steps.pop();
        resetStepMetadata(lastStep, stepMetadata);
        return lastStep;
    }

    private async generateJar(stepMetadata: IStepMetadata): Promise<boolean> {
        if (_.isEmpty(stepMetadata.elements)) {
            stepMetadata.classpaths = [];
            if (!(await this.generateElements(stepMetadata))) {
                return false;
            }
        }
        let destPath = "";
        if (stepMetadata.outputPath === ExportJarTargets.SETTING_ASKUSER || stepMetadata.outputPath === "") {
            if (stepMetadata.outputPath === ExportJarTargets.SETTING_ASKUSER) {
                sendInfo("", { exportJarPath: stepMetadata.outputPath });
            }
            const outputUri: Uri = await saveDialog(stepMetadata.workspaceFolder.uri, "Generate");
            if (outputUri === undefined) {
                return Promise.reject();
            }
            destPath = outputUri.fsPath;
        } else {
            // Both the absolute path and the relative path (to workspace folder) are supported.
            destPath = (isAbsolute(stepMetadata.outputPath)) ?
                stepMetadata.outputPath :
                join(stepMetadata.workspaceFolder.uri.fsPath, stepMetadata.outputPath);
            // Since both the specific target folder and the specific target file are supported,
            // we regard a path as a file if it ends with ".jar". Otherwise, it was regarded as a folder.
            if (extname(stepMetadata.outputPath) !== ".jar") {
                destPath = join(destPath, stepMetadata.workspaceFolder.name + ".jar");
            }
            await ensureDir(dirname(destPath));
        }
        destPath = normalize(destPath);
        return window.withProgress({
            location: ProgressLocation.Window,
            title: "Exporting Jar : Generating jar...",
            cancellable: true,
        }, (progress, token) => {
            return new Promise<boolean>(async (resolve, reject) => {
                token.onCancellationRequested(() => {
                    return reject();
                });
                const exportResult: IExportResult = await Jdtls.exportJar(basename(stepMetadata.mainMethod), stepMetadata.classpaths, destPath);
                if (exportResult.result === true) {
                    stepMetadata.outputPath = destPath;
                    return resolve(true);
                } else {
                    return reject(new Error("Export jar failed." + exportResult.message));
                }
            });
        });
    }

    private async generateElements(stepMetadata: IStepMetadata): Promise<boolean> {
        const extensionApi: any = await getExtensionApi();
        const dependencyItems: IJarQuickPickItem[] = await window.withProgress({
            location: ProgressLocation.Window,
            title: "Exporting Jar : Resolving classpaths...",
            cancellable: true,
        }, (progress, token) => {
            return new Promise<IJarQuickPickItem[]>(async (resolve, reject) => {
                token.onCancellationRequested(() => {
                    return reject();
                });
                const pickItems: IJarQuickPickItem[] = [];
                const uriSet: Set<string> = new Set<string>();
                for (const project of stepMetadata.projectList) {
                    const runTimeClassPaths: IClasspathResult = await extensionApi.getClasspaths(project.uri, { scope: "runtime" });
                    pickItems.push(
                        ...await this.parseDependencyItems(runTimeClassPaths.classpaths, uriSet, stepMetadata.workspaceFolder.uri.fsPath, true),
                        ...await this.parseDependencyItems(runTimeClassPaths.modulepaths, uriSet, stepMetadata.workspaceFolder.uri.fsPath, true));
                    const testClassPaths: IClasspathResult = await extensionApi.getClasspaths(project.uri, { scope: "test" });
                    pickItems.push(
                        ...await this.parseDependencyItems(testClassPaths.classpaths, uriSet, stepMetadata.workspaceFolder.uri.fsPath, false),
                        ...await this.parseDependencyItems(testClassPaths.modulepaths, uriSet, stepMetadata.workspaceFolder.uri.fsPath, false));
                }
                return resolve(pickItems);
            });
        });
        if (_.isEmpty(dependencyItems)) {
            throw new Error("No classpath found. Please make sure your java project is valid.");
        } else if (dependencyItems.length === 1) {
            const classpath: IClassPath = {
                source: dependencyItems[0].path,
                destination: undefined,
                isDependency: false,
            };
            stepMetadata.classpaths.push(classpath);
            return true;
        }
        dependencyItems.sort((node1, node2) => {
            if (node1.description !== node2.description) {
                return node1.description.localeCompare(node2.description);
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
                            if (item.type === "external") {
                                const classpath: IClassPath = {
                                    source: item.path,
                                    destination: undefined,
                                    isDependency: true,
                                };
                                stepMetadata.classpaths.push(classpath);
                            } else {
                                const posixPath: string = toPosixPath(item.path);
                                for (const path of await globby(posixPath)) {
                                    const classpath: IClassPath = {
                                        source: path,
                                        destination: relative(posixPath, path),
                                        isDependency: false,
                                    };
                                    stepMetadata.classpaths.push(classpath);
                                }
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

    private async parseDependencyItems(paths: string[], uriSet: Set<string>, projectPath: string, isRuntime: boolean): Promise<IJarQuickPickItem[]> {
        const dependencyItems: IJarQuickPickItem[] = [];
        for (const classpath of paths) {
            if (await pathExists(classpath) === false) {
                continue;
            }
            const extName = extname(classpath);
            const baseName = Uri.parse(classpath).fsPath.startsWith(Uri.parse(projectPath).fsPath) ?
                relative(projectPath, classpath) : basename(classpath);
            const descriptionValue = (isRuntime) ? "Runtime" : "Test";
            const typeValue = (extName === ".jar") ? "external" : "internal";
            if (!uriSet.has(classpath)) {
                uriSet.add(classpath);
                dependencyItems.push({
                    label: baseName,
                    description: descriptionValue,
                    path: classpath,
                    type: typeValue,
                    picked: isRuntime,
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
