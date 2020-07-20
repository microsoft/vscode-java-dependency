// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { EOL, platform } from "os";
import { basename, extname, join } from "path";
import { CancellationToken, commands, Extension, extensions, ProgressLocation,
         QuickInputButtons, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { isStandardServerReady } from "../extension";
import { Jdtls } from "../java/jdtls";
import { INodeData } from "../java/nodeData";
import { buildWorkspace } from "./build";
import { JarQuickPickItem } from "./jarQuickPickItem";
import { WorkspaceNode } from "./workspaceNode";

const SOLVE_PROJECT = "solve project";
const SOLVE_MAINMETHOD = "solve mainmethod";
const GENERATE_JAR = "generate jar";
const FINISH = "finish";

let mainMethods: MainMethodInfo[];

export async function createJarFile(node?: INodeData) {
    if (!isStandardServerReady()) {
        return;
    }
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
            mainMethods = await Jdtls.getMainMethod();
            const pickSteps: string[] = [];
            let step: string = SOLVE_PROJECT;
            let rootNodes: INodeData[] = [];
            let projectFolder: WorkspaceFolder;
            let pickResult: string;
            let outputFileName: string;
            while (step !== FINISH) {
                try {
                    switch (step) {
                        case SOLVE_PROJECT: {
                            projectFolder = await resolveProject(progress, token, pickSteps, node);
                            rootNodes = await Jdtls.getProjects(projectFolder.uri.toString());
                            step = SOLVE_MAINMETHOD;
                            break;
                        }
                        case SOLVE_MAINMETHOD: {
                            pickResult = await resolveMainMethod(progress, token, pickSteps, projectFolder.uri.fsPath);
                            step = GENERATE_JAR;
                            break;
                        }
                        case GENERATE_JAR: {
                            outputFileName = await generateJar(progress, token, pickSteps, rootNodes, pickResult, projectFolder.uri.fsPath);
                            resolve(outputFileName);
                            step = FINISH;
                            break;
                        }
                    }
                } catch (err) {
                    if (err === InputFlowAction.back) {
                        step = pickSteps.pop();
                        continue;
                    } else {
                        return reject();
                    }
                }
            }
        });
    }).then((message) => { successMessage(message); });
}

function resolveProject(progress, token: CancellationToken, pickSteps: string[], node?: INodeData): Promise<WorkspaceFolder | undefined> {
    return new Promise<WorkspaceFolder>((resolve, reject) => {
        if (token.isCancellationRequested) {
            return reject();
        }
        const folders = workspace.workspaceFolders;
        if (node instanceof WorkspaceNode) {
            if (folders === undefined) {
                return reject();
            }
            folders.forEach((folder) => {
                if (folder.uri.toString() === node.uri) {
                    return resolve(folder);
                }
            });
            return reject();
        }
        let projectFolder: WorkspaceFolder;
        if (folders && folders.length) {
            if (folders.length === 1) {
                return resolve(folders[0]);
            }
            progress.report({ increment: 10, message: "Selecting project..." });
            const pickNodes: JarQuickPickItem[] = [];
            for (const folder of folders) {
                pickNodes.push(new JarQuickPickItem(folder.name, folder.uri.fsPath, folder.uri.fsPath));
            }
            const pickBox = window.createQuickPick<JarQuickPickItem>();
            pickBox.items = pickNodes;
            pickBox.title = "Export Jar - Determine project";
            pickBox.placeholder = "Select the project...";
            pickBox.ignoreFocusOut = true;
            pickBox.onDidAccept(() => {
                pickSteps.push(SOLVE_PROJECT);
                folders.forEach((folder) => {
                    if (folder.uri.fsPath === pickBox.selectedItems[0].uri) {
                        projectFolder = folder;
                    }
                });
                resolve(projectFolder);
                pickBox.dispose();
            });
            pickBox.onDidHide(() => {
                reject();
                pickBox.dispose();
            });
            pickBox.show();
        } else {
            failMessage("No project found");
            return reject();
        }
    });
}

function generateJar(progress, token: CancellationToken, pickSteps: string[], rootNodes: INodeData[],
                     description: string, outputPath: string): Promise<string | undefined> {
    return new Promise(async (resolve, reject) => {
        if (token.isCancellationRequested) {
            return reject();
        } else if (rootNodes === undefined) {
            failMessage("No module found in this project");
            return reject();
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
        const exportResult = await Jdtls.exportJar(basename(description), outClassPaths, outputFileName);
        if (exportResult === true) {
            resolve(outputFileName);
        } else {
            reject();
        }
    });
}

function resolveMainMethod(progress, token: CancellationToken, pickSteps: string[], projectPath: string): Promise<string | undefined> {
    return new Promise<string>(async (resolve, reject) => {
        if (token.isCancellationRequested) {
            return reject();
        }
        progress.report({ increment: 10, message: "Resolving main classes..." });
        if (mainMethods === undefined || mainMethods.length === 0) {
            return resolve("");
        }
        progress.report({ increment: 30, message: "Determining main class..." });
        const pickNodes: JarQuickPickItem[] = [];
        for (const mainMethod of mainMethods) {
            if (Uri.file(mainMethod.path).fsPath.includes(projectPath)) {
                pickNodes.push(new JarQuickPickItem(getName(mainMethod), mainMethod.name));
            }
        }
        if (pickNodes.length === 0) {
            return resolve("");
        } else {
            const pickBox = window.createQuickPick<JarQuickPickItem>();
            pickNodes.push(new JarQuickPickItem("No main class", ""));
            pickBox.items = pickNodes;
            pickBox.title = "Export Jar - Determine main class";
            pickBox.placeholder = "Select the main class...";
            pickBox.ignoreFocusOut = true;
            pickBox.buttons = pickSteps.length > 0 ? [(QuickInputButtons.Back)] : [];
            pickBox.onDidTriggerButton((item) => {
                if (item === QuickInputButtons.Back) {
                    reject(InputFlowAction.back);
                    pickBox.dispose();
                }
            });
            pickBox.onDidAccept(() => {
                pickSteps.push(SOLVE_MAINMETHOD);
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
    window.showInformationMessage(message, "Done");
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
    return new Promise<string[]>(async (resolve, reject) => {
        const extension: Extension<any> | undefined = extensions.getExtension("redhat.java");
        const extensionApi: any = await extension?.activate();
        const outClassPaths: string[] = [];
        const setUris: Set<string> = new Set<string>();
        const pickDependencies: JarQuickPickItem[] = [];
        const pickedDependencies: JarQuickPickItem[] = [];
        for (const rootNode of rootNodes) {
            const modulePaths: ClasspathResult = await extensionApi.getClasspaths(rootNode.uri, { scope: "runtime" });
            generateDependencies(modulePaths.classpaths, setUris, pickDependencies, projectPath, true);
            generateDependencies(modulePaths.modulepaths, setUris, pickDependencies, projectPath, true);
            const modulePathsTest: ClasspathResult = await extensionApi.getClasspaths(rootNode.uri, { scope: "test" });
            generateDependencies(modulePathsTest.classpaths, setUris, pickDependencies, projectPath, false);
            generateDependencies(modulePathsTest.modulepaths, setUris, pickDependencies, projectPath, false);
        }
        const pickBox = window.createQuickPick<JarQuickPickItem>();
        pickDependencies.sort((node1, node2) => {
            if (node1.description !== node2.description) {
                return node1.description.localeCompare(node2.description);
            }
            if (node1.type !== node2.type) {
                return node2.type.localeCompare(node1.type);
            }
            return node1.label.localeCompare(node2.label);
        });
        pickBox.items = pickDependencies;
        pickDependencies.forEach((pickDependency) => {
            if (pickDependency.picked) {
                pickedDependencies.push(pickDependency);
            }
        });
        pickBox.selectedItems = pickedDependencies;
        pickBox.title = "Export Jar - Determine elements";
        pickBox.placeholder = "Select the elements...";
        pickBox.canSelectMany = true;
        pickBox.ignoreFocusOut = true;
        pickBox.buttons = pickSteps.length > 0 ? [(QuickInputButtons.Back)] : [];
        pickBox.onDidTriggerButton((item) => {
            if (item === QuickInputButtons.Back) {
                reject(InputFlowAction.back);
                pickBox.dispose();
            }
        });
        pickBox.onDidAccept(() => {
            pickBox.selectedItems.forEach((item) => {
                outClassPaths.push(item.uri);
            });
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

function generateDependencies(paths: string[], setUris: Set<string>, pickDependencies: JarQuickPickItem[],
                              projectPath: string, isRuntime: boolean) {
    paths.forEach((classpath: string) => {
        const extName = extname(classpath);
        const baseName = (extName === ".jar") ? basename(classpath) : classpath.substring(projectPath.length + 1);
        const description = (isRuntime) ? "Runtime" : "Test";
        const type = (extName === ".jar") ? "external" : "internal";
        if (!setUris.has(classpath)) {
            setUris.add(classpath);
            pickDependencies.push(new JarQuickPickItem(baseName, description, classpath, type, isRuntime));
        }
    });
}
function getName(data: MainMethodInfo) {
    const point = data.name.lastIndexOf(".");
    if (point === -1) {
        return data.name;
    } else {
        return data.name.substring(point + 1);
    }
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
