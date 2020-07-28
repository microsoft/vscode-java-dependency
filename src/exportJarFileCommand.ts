// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { pathExists } from "fs-extra";
import { EOL, platform } from "os";
import { basename, extname, join } from "path";
import { commands, Extension, extensions, ProgressLocation, QuickInputButtons, QuickPick, QuickPickItem, Uri, window, workspace } from "vscode";
import { sendOperationError } from "vscode-extension-telemetry-wrapper";
import { buildWorkspace } from "./build";
import { isStandardServerReady } from "./extension";
import { Jdtls } from "./java/jdtls";
import { INodeData } from "./java/nodeData";
import { WorkspaceNode } from "./views/workspaceNode";

enum ExportSteps {
    ResolveWorkspace = "RESOLVEWORKSPACE",
    ResolveMainMethod = "RESOLVEMAINMETHOD",
    GenerateJar = "GENERATEJAR",
    Finish = "FINISH",
}

let isExportingJar: boolean = false;

export async function createJarFile(node?: INodeData) {
    if (!isStandardServerReady() || isExportingJar) {
        return;
    }
    isExportingJar = true;
    return new Promise<string>(async (resolve, reject) => {
        if (await buildWorkspace() === false) {
            return reject();
        }
        const pickSteps: string[] = [];
        let step: string = ExportSteps.ResolveWorkspace;
        let selectedMainMethod: string;
        let workspaceUri: Uri;
        let projectList: INodeData[] = [];
        while (step !== ExportSteps.Finish) {
            try {
                switch (step) {
                    case ExportSteps.ResolveWorkspace: {
                        const workspaceFolder: string = await resolveWorkspaceFolder(pickSteps, node);
                        workspaceUri = Uri.parse(workspaceFolder);
                        projectList = await Jdtls.getProjects(workspaceUri.toString());
                        if (projectList === undefined) {
                            throw new Error("No project found. Please make sure your project folder is opened.");
                        }
                        step = ExportSteps.ResolveMainMethod;
                        break;
                    }
                    case ExportSteps.ResolveMainMethod: {
                        selectedMainMethod = await resolveMainMethod(pickSteps, workspaceUri.toString());
                        step = ExportSteps.GenerateJar;
                        break;
                    }
                    case ExportSteps.GenerateJar: {
                        resolve(await generateJar(pickSteps, projectList, selectedMainMethod, workspaceUri.fsPath));
                        step = ExportSteps.Finish;
                        break;
                    }
                }
            } catch (err) {
                if (err === QuickInputButtons.Back) {
                    step = pickSteps.pop();
                    continue;
                } else if (err instanceof Error) {
                    return reject(err.message);
                } else {
                    return reject(err);
                }
            }
        }
    }).then((message) => {
        successMessage(message);
        isExportingJar = false;
    }, (err) => {
        failMessage(err);
        isExportingJar = false;
    });
}

async function resolveWorkspaceFolder(pickSteps: string[], node?: INodeData): Promise<string | undefined> {
    if (node instanceof WorkspaceNode) {
        return node.uri;
    }
    const folders = workspace.workspaceFolders;
    // Guarded by workspaceFolderCount != 0 in package.json
    if (folders.length === 1) {
        return folders[0].uri.toString();
    }
    const pickItems: IJarQuickPickItem[] = [];
    for (const folder of folders) {
        pickItems.push({
            label: folder.name,
            description: folder.uri.fsPath,
            uri: folder.uri.toString(),
        });
    }
    return new Promise<string | undefined>((resolve, reject) => {
        const pickBox = createPickBox("Export Jar : Determine project", "Select the project...", pickItems, pickSteps.length > 0);
        pickBox.onDidAccept(() => {
            pickSteps.push(ExportSteps.ResolveWorkspace);
            resolve(pickBox.selectedItems[0].uri);
            pickBox.dispose();
        });
        pickBox.onDidHide(() => {
            reject();
            pickBox.dispose();
        });
        pickBox.show();
    });
}

async function generateJar(pickSteps: string[], projectList: INodeData[],
                           selectedMainMethod: string, outputPath: string): Promise<string | undefined> {
    const elements: string[] = await generateElements(pickSteps, projectList, outputPath);
    return window.withProgress({
        location: ProgressLocation.Window,
        title: "Exporting Jar : Generating jar...",
        cancellable: true,
    }, (progress, token) => {
        return new Promise<string>(async (resolve, reject) => {
            token.onCancellationRequested(() => {
                return reject();
            });
            const destPath = join(outputPath, basename(outputPath) + ".jar");
            const exportResult = await Jdtls.exportJar(basename(selectedMainMethod), elements, destPath);
            if (exportResult === true) {
                resolve(destPath);
            } else {
                reject(new Error("Export jar failed."));
            }
        });
    });
}

async function resolveMainMethod(pickSteps: string[], projectPath: string): Promise<string | undefined> {
    const mainMethods: MainMethodInfo[] = await window.withProgress({
        location: ProgressLocation.Window,
        title: "Exporting Jar : Resolving main classes...",
        cancellable: true,
    }, (progress, token) => {
        return new Promise<MainMethodInfo[] | undefined>(async (resolve, reject) => {
            token.onCancellationRequested(() => {
                return reject();
            });
            resolve(await Jdtls.getMainMethod(projectPath));
        });
    });
    if (mainMethods === undefined || mainMethods.length === 0) {
        return "";
    }
    const pickItems: IJarQuickPickItem[] = [];
    for (const mainMethod of mainMethods) {
        pickItems.push({
            label: getName(mainMethod),
            description: mainMethod.name,
        });
    }
    const noMainClassItem: IJarQuickPickItem = {
        label: "<without main class>",
    };
    pickItems.push(noMainClassItem);
    return new Promise<string | undefined>(async (resolve, reject) => {
        const pickBox = createPickBox("Export Jar : Determine main class", "Select the main class...", pickItems, pickSteps.length > 0);
        pickBox.onDidTriggerButton((item) => {
            if (item === QuickInputButtons.Back) {
                reject(item);
                pickBox.dispose();
            }
        });
        pickBox.onDidAccept(() => {
            pickSteps.push(ExportSteps.ResolveMainMethod);
            resolve(pickBox.selectedItems[0].description);
            pickBox.dispose();
        });
        pickBox.onDidHide(() => {
            reject();
            pickBox.dispose();
        });
        pickBox.show();
    });
}

function failMessage(message: string) {
    sendOperationError("", "Export Jar", new Error(message));
    window.showErrorMessage(message, "Done");
}

function successMessage(outputFileName: string) {
    let openInExplorer: string;
    if (platform() === "win32") {
        openInExplorer = "Reveal in File Explorer";
    } else if (platform() === "darwin") {
        openInExplorer = "Reveal in Finder";
    } else {
        openInExplorer = "Open Containing Folder";
    }
    window.showInformationMessage("Successfully exported jar to" + EOL + outputFileName,
        openInExplorer, "Done").then((messageResult) => {
            if (messageResult === openInExplorer) {
                commands.executeCommand("revealFileInOS", Uri.file(outputFileName));
            }
        });
}

async function generateElements(pickSteps: string[], projectList: INodeData[], projectPath: string): Promise<string[] | undefined> {
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
            for (const rootNode of projectList) {
                const classPaths: ClasspathResult = await extensionApi.getClasspaths(rootNode.uri, { scope: "runtime" });
                pickItems.push(...await parseDependencyItems(classPaths.classpaths, uriSet, projectPath, true),
                    ...await parseDependencyItems(classPaths.modulepaths, uriSet, projectPath, true));
                const classPathsTest: ClasspathResult = await extensionApi.getClasspaths(rootNode.uri, { scope: "test" });
                pickItems.push(...await parseDependencyItems(classPathsTest.classpaths, uriSet, projectPath, false),
                    ...await parseDependencyItems(classPathsTest.modulepaths, uriSet, projectPath, false));
            }
            resolve(pickItems);
        });
    });
    const elements: string[] = [];
    if (dependencyItems.length === 0) {
        throw new Error("No classpath found. Please make sure your project is valid.");
    } else if (dependencyItems.length === 1) {
        elements.push(dependencyItems[0].uri);
        return elements;
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
    return new Promise<string[] | undefined>(async (resolve, reject) => {
        const pickBox = createPickBox("Export Jar : Determine elements", "Select the elements...", dependencyItems, pickSteps.length > 0, true);
        pickBox.selectedItems = pickedDependencyItems;
        pickBox.onDidTriggerButton((item) => {
            if (item === QuickInputButtons.Back) {
                reject(item);
                pickBox.dispose();
            }
        });
        pickBox.onDidAccept(() => {
            for (const item of pickBox.selectedItems) {
                elements.push(item.uri);
            }
            resolve(elements);
            pickBox.dispose();
        });
        pickBox.onDidHide(() => {
            reject();
            pickBox.dispose();
        });
        pickBox.show();
    });
}

function createPickBox(title: string, placeholder: string, items: IJarQuickPickItem[],
                       backBtnEnabled: boolean, canSelectMany: boolean = false): QuickPick<IJarQuickPickItem> {
    const pickBox = window.createQuickPick<IJarQuickPickItem>();
    pickBox.title = title;
    pickBox.placeholder = placeholder;
    pickBox.canSelectMany = canSelectMany;
    pickBox.items = items;
    pickBox.ignoreFocusOut = true;
    pickBox.buttons = backBtnEnabled ? [(QuickInputButtons.Back)] : [];
    return pickBox;
}

async function parseDependencyItems(paths: string[], uriSet: Set<string>, projectPath: string, isRuntime: boolean): Promise<IJarQuickPickItem[]> {
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

function getName(data: MainMethodInfo) {
    return data.name.substring(data.name.lastIndexOf(".") + 1);
}

class ClasspathResult {
    public projectRoot: string;
    public classpaths: string[];
    public modulepaths: string[];
}

export class MainMethodInfo {
    public name: string;
    public path: string;
}

interface IJarQuickPickItem extends QuickPickItem {
    uri?: string;
    type?: string;
}
