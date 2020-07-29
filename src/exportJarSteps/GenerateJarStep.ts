// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { pathExists } from "fs-extra";
import { EOL, platform } from "os";
import { basename, extname, join } from "path";
import { Extension, extensions, ProgressLocation, QuickInputButtons, window } from "vscode";
import { GenerateSettings } from "../exportJarFileCommand";
import { Jdtls } from "../java/jdtls";
import { INodeData } from "../java/nodeData";
import { ExportSteps, IStep } from "./IStep";
import { createPickBox, IJarQuickPickItem } from "./utility";

export class GenerateJarStep implements IStep {

    public exportStep: ExportSteps;

    constructor() {
        this.exportStep = ExportSteps.GenerateJar;
    }

    public async execute(lastStep: IStep | undefined, generateSettings: GenerateSettings): Promise<ExportSteps> {
        return await this.generateJar(lastStep, generateSettings) ? ExportSteps.Finish : lastStep.exportStep;
    }

    private async generateJar(lastStep: IStep | undefined, generateSettings: GenerateSettings): Promise<boolean> {
        if (await this.generateElements(lastStep, generateSettings) === false) {
            return false;
        }
        return window.withProgress({
            location: ProgressLocation.Window,
            title: "Exporting Jar : Generating jar...",
            cancellable: true,
        }, (progress, token) => {
            return new Promise<boolean>(async (resolve, reject) => {
                token.onCancellationRequested(() => {
                    return reject();
                });
                const destPath = join(generateSettings.workspaceUri.fsPath, basename(generateSettings.workspaceUri.fsPath) + ".jar");
                const exportResult = await Jdtls.exportJar(basename(generateSettings.selectedMainMethod), generateSettings.elements, destPath);
                if (exportResult === true) {
                    generateSettings.outputPath = destPath;
                    resolve(true);
                } else {
                    reject(new Error("Export jar failed."));
                }
            });
        });
    }

    private async generateElements(lastStep: IStep | undefined, generateSettings: GenerateSettings): Promise<boolean> {
        const extension: Extension<any> | undefined = extensions.getExtension("redhat.java");
        const extensionApi: any = await extension?.activate();
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
                for (const rootNode of generateSettings.projectList) {
                    const classPaths: ClasspathResult = await extensionApi.getClasspaths(rootNode.uri, { scope: "runtime" });
                    pickItems.push(...await this.parseDependencyItems(classPaths.classpaths, uriSet, generateSettings.workspaceUri.fsPath, true),
                        ...await this.parseDependencyItems(classPaths.modulepaths, uriSet, generateSettings.workspaceUri.fsPath, true));
                    const classPathsTest: ClasspathResult = await extensionApi.getClasspaths(rootNode.uri, { scope: "test" });
                    pickItems.push(...await this.parseDependencyItems(classPathsTest.classpaths, uriSet, generateSettings.workspaceUri.fsPath, false),
                        ...await this.parseDependencyItems(classPathsTest.modulepaths, uriSet, generateSettings.workspaceUri.fsPath, false));
                }
                resolve(pickItems);
            });
        });
        if (dependencyItems.length === 0) {
            throw new Error("No classpath found. Please make sure your project is valid.");
        } else if (dependencyItems.length === 1) {
            generateSettings.elements.push(dependencyItems[0].uri);
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
        return new Promise<boolean>(async (resolve, reject) => {
            const pickBox = createPickBox("Export Jar : Determine elements", "Select the elements", dependencyItems, lastStep !== undefined, true);
            pickBox.selectedItems = pickedDependencyItems;
            pickBox.onDidTriggerButton((item) => {
                if (item === QuickInputButtons.Back) {
                    resolve(false);
                    pickBox.dispose();
                }
            });
            pickBox.onDidAccept(() => {
                for (const item of pickBox.selectedItems) {
                    generateSettings.elements.push(item.uri);
                }
                resolve(true);
                pickBox.dispose();
            });
            pickBox.onDidHide(() => {
                reject();
                pickBox.dispose();
            });
            pickBox.show();
        });
    }

    private async parseDependencyItems(paths: string[], uriSet: Set<string>, projectPath: string, isRuntime: boolean): Promise<IJarQuickPickItem[]> {
        const dependencyItems: IJarQuickPickItem[] = [];
        for (const classpath of paths) {
            if (await pathExists(classpath) === false) {
                continue;
            }
            const extName = extname(classpath);
            const baseName = (extName === ".jar") ? basename(classpath) : classpath.substring(projectPath.length + 1);
            const descriptionValue = (isRuntime) ? "Runtime" : "Test";
            const typeValue = (extName === ".jar") ? "external" : "internal";
            if (!uriSet.has(classpath)) {
                uriSet.add(classpath);
                dependencyItems.push({
                    label: baseName,
                    description: descriptionValue,
                    uri: classpath,
                    type: typeValue,
                    picked: isRuntime,
                });
            }
        }
        return dependencyItems;
    }

}

class ClasspathResult {
    public projectRoot: string;
    public classpaths: string[];
    public modulepaths: string[];
}
