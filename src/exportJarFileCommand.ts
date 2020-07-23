// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { EOL, platform } from "os";
import { basename, extname, join } from "path";
import { CancellationToken, commands, Extension, extensions, ProgressLocation,
         QuickInputButtons, QuickPick, QuickPickItem, Uri, window, workspace } from "vscode";
import { buildWorkspace } from "./build";
import { isStandardServerReady } from "./extension";
import { Jdtls } from "./java/jdtls";
import { INodeData } from "./java/nodeData";
import { WorkspaceNode } from "./views/workspaceNode";

enum ExportSteps {
    ResolveProject = "RESOLVEPROJECT",
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
    window.withProgress({
        location: ProgressLocation.Window,
        title: "Exporting Jar... ",
        cancellable: true,
    }, (progress, token): Promise<string> => {
        return new Promise<string>(async (resolve, reject) => {
            token.onCancellationRequested(() => {
                return reject();
            });
            progress.report({ increment: 10, message: "Building workspace..." });
            if (await buildWorkspace() === false) {
                return reject();
            }
            const pickSteps: string[] = [];
            let step: string = ExportSteps.ResolveProject;
            let rootNodes: INodeData[] = [];
            let projectFolder: string;
            let projectUri: Uri;
            let selectedMainMethod: string;
            let outputFilePath: string;
            while (step !== ExportSteps.Finish) {
                try {
                    switch (step) {
                        case ExportSteps.ResolveProject: {
                            projectFolder = await resolveProject(progress, token, pickSteps, node);
                            projectUri = Uri.parse(projectFolder);
                            rootNodes = await Jdtls.getProjects(projectUri.toString());
                            step = ExportSteps.ResolveMainMethod;
                            break;
                        }
                        case ExportSteps.ResolveMainMethod: {
                            selectedMainMethod = await resolveMainMethod(progress, token, pickSteps, projectUri.toString());
                            step = ExportSteps.GenerateJar;
                            break;
                        }
                        case ExportSteps.GenerateJar: {
                            outputFilePath = await generateJar(progress, token, pickSteps, rootNodes, selectedMainMethod, projectUri.fsPath);
                            resolve(outputFilePath);
                            step = ExportSteps.Finish;
                            break;
                        }
                    }
                } catch (err) {
                    if (err === InputFlowAction.back) {
                        step = pickSteps.pop();
                        continue;
                    } else {
                        return reject(err);
                    }
                }
            }
        });
    }).then((message) => {
        successMessage(message);
        isExportingJar = false;
    }, (err) => {
        failMessage(err);
        isExportingJar = false;
     });
}

function resolveProject(progress, token: CancellationToken, pickSteps: string[], node?: INodeData): Promise<string | undefined> {
    return new Promise<string | undefined>((resolve, reject) => {
        if (token.isCancellationRequested) {
            return reject();
        }
        if (node instanceof WorkspaceNode) {
            return resolve(node.uri);
        }
        const folders = workspace.workspaceFolders;
        if (folders && folders.length) {
            if (folders.length === 1) {
                return resolve(folders[0].uri.toString());
            }
            progress.report({ increment: 10, message: "Selecting project..." });
            const pickNodes: IJarQuickPickItem[] = [];
            for (const folder of folders) {
                const jarQuickPickItem: IJarQuickPickItem = {
                    label: folder.name,
                    description: folder.uri.fsPath,
                    uri: folder.uri.toString(),
                };
                pickNodes.push(jarQuickPickItem);
            }
            const pickBox = createPickBox("Export Jar - Determine project", "Select the project...", pickNodes, pickSteps.length > 0);
            pickBox.onDidAccept(() => {
                pickSteps.push(ExportSteps.ResolveProject);
                resolve(pickBox.selectedItems[0].uri);
                pickBox.dispose();
            });
            pickBox.onDidHide(() => {
                reject();
                pickBox.dispose();
            });
            pickBox.show();
        } else {
            return reject("No workspace folder found.");
        }
    });
}

function generateJar(progress, token: CancellationToken, pickSteps: string[], rootNodes: INodeData[],
                     selectedMainMethod: string, outputPath: string): Promise<string | undefined> {
    return new Promise<string | undefined>(async (resolve, reject) => {
        if (token.isCancellationRequested) {
            return reject();
        } else if (rootNodes === undefined) {
            return reject("No project found.");
        }
        progress.report({ increment: 10, message: "Resolving classpaths..." });
        let outClassPaths: string[];
        try {
            outClassPaths = await generateOutClassPath(pickSteps, rootNodes, outputPath);
        } catch (e) {
            return reject(e);
        }
        const outputFileName = join(outputPath, basename(outputPath) + ".jar");
        progress.report({ increment: 30, message: "Generating jar..." });
        const exportResult = await Jdtls.exportJar(basename(selectedMainMethod), outClassPaths, outputFileName);
        if (exportResult === true) {
            resolve(outputFileName);
        } else {
            reject("Export jar failed.");
        }
    });
}

function resolveMainMethod(progress, token: CancellationToken, pickSteps: string[], projectPath: string): Promise<string | undefined> {
    return new Promise<string | undefined>(async (resolve, reject) => {
        if (token.isCancellationRequested) {
            return reject();
        }
        progress.report({ increment: 10, message: "Resolving main classes..." });
        const mainMethods: MainMethodInfo[] = await Jdtls.getMainMethod(projectPath);
        if (mainMethods === undefined || mainMethods.length === 0) {
            return resolve("");
        }
        progress.report({ increment: 30, message: "" });
        const pickNodes: IJarQuickPickItem[] = [];
        for (const mainMethod of mainMethods) {
            const jarQuickPickItem: IJarQuickPickItem = {
                label: getName(mainMethod),
                description: mainMethod.name,
            };
            pickNodes.push(jarQuickPickItem);
        }
        if (pickNodes.length === 0) {
            return resolve("");
        } else {
            const noMainClassItem: IJarQuickPickItem = {
                label: "No main class",
                description: "",
            };
            pickNodes.push(noMainClassItem);
            const pickBox = createPickBox("Export Jar - Determine main class", "Select the main class...", pickNodes, pickSteps.length > 0);
            pickBox.onDidTriggerButton((item) => {
                if (item === QuickInputButtons.Back) {
                    reject(InputFlowAction.back);
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
        }
    });
}

function failMessage(message: string) {
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

async function generateOutClassPath(pickSteps: string[], rootNodes: INodeData[], projectPath: string): Promise<string[] | undefined> {
    return new Promise<string[] | undefined>(async (resolve, reject) => {
        const extension: Extension<any> | undefined = extensions.getExtension("redhat.java");
        const extensionApi: any = await extension?.activate();
        const outClassPaths: string[] = [];
        const setUris: Set<string> = new Set<string>();
        const pickDependencies: IJarQuickPickItem[] = [];
        const pickedDependencies: IJarQuickPickItem[] = [];
        for (const rootNode of rootNodes) {
            const classPaths: ClasspathResult = await extensionApi.getClasspaths(rootNode.uri, { scope: "runtime" });
            pickDependencies.push(...generateDependencies(classPaths.classpaths, setUris, projectPath, true),
                ...generateDependencies(classPaths.modulepaths, setUris, projectPath, true));
            const classPathsTest: ClasspathResult = await extensionApi.getClasspaths(rootNode.uri, { scope: "test" });
            pickDependencies.push(...generateDependencies(classPathsTest.classpaths, setUris, projectPath, false),
                ...generateDependencies(classPathsTest.modulepaths, setUris, projectPath, false));
        }
        if (pickDependencies.length === 0) {
            return reject("No class path found.");
        } else if (pickDependencies.length === 1) {
            outClassPaths.push(pickDependencies[0].uri);
            return resolve(outClassPaths);
        }
        pickDependencies.sort((node1, node2) => {
            if (node1.description !== node2.description) {
                return node1.description.localeCompare(node2.description);
            }
            if (node1.type !== node2.type) {
                return node2.type.localeCompare(node1.type);
            }
            return node1.label.localeCompare(node2.label);
        });
        for (const pickDependency of pickDependencies) {
            if (pickDependency.picked) {
                pickedDependencies.push(pickDependency);
            }
        }
        const pickBox = createPickBox("Export Jar - Determine elements", "Select the elements...", pickDependencies, pickSteps.length > 0, true);
        pickBox.selectedItems = pickedDependencies;
        pickBox.onDidTriggerButton((item) => {
            if (item === QuickInputButtons.Back) {
                reject(InputFlowAction.back);
                pickBox.dispose();
            }
        });
        pickBox.onDidAccept(() => {
            for (const item of pickBox.selectedItems) {
                outClassPaths.push(item.uri);
            }
            resolve(outClassPaths);
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

function generateDependencies(paths: string[], setUris: Set<string>, projectPath: string, isRuntime: boolean): IJarQuickPickItem[] {
    const pickDependencies: IJarQuickPickItem[] = [];
    for (const classpath of paths) {
        const extName = extname(classpath);
        const baseName = (extName === ".jar") ? basename(classpath) : classpath.substring(projectPath.length + 1);
        const descriptionValue = (isRuntime) ? "Runtime" : "Test";
        const typeValue = (extName === ".jar") ? "external" : "internal";
        if (!setUris.has(classpath)) {
            setUris.add(classpath);
            const jarQuickPickItem: IJarQuickPickItem = {
                label: baseName,
                description: descriptionValue,
                uri: classpath,
                type: typeValue,
                picked: isRuntime,
            };
            pickDependencies.push(jarQuickPickItem);
        }
    }
    return pickDependencies;
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

class InputFlowAction {
    public static back = new InputFlowAction();
}

interface IJarQuickPickItem extends QuickPickItem {
    uri?: string;
    type?: string;
}
