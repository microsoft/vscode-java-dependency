import { EOL } from "os";
import { basename, extname, join } from "path";
import { CancellationToken, commands, Extension, extensions, MessageItem, MessageOptions,
         ProgressLocation, QuickInputButtons, Uri, window, workspace, WorkspaceFolder } from "vscode";

import { isStandardServerReady } from "../extension";
import { Jdtls } from "../java/jdtls";
import { INodeData } from "../java/nodeData";

import { buildWorkspace } from "./build";
import { ElementPickNode } from "./elementPickNode";
import { ProjectPickNode } from "./projectPickNode";
import { QuickPickNode } from "./quickPickNode";
import { WorkspaceNode } from "./workspaceNode";

const SOLVE_PROJECT = "solve project";
const SOLVE_MAINMETHOD = "solve mainmethod";
const GENERATE_JAR = "generate jar";
const FINISH = "finish";

export class ExportJarFile {

    public static mainMethods: MainMethodInfo[];

    public static async createJarFile(node?: INodeData) {
        if (!isStandardServerReady()) {
            return;
        }
        window.withProgress({
            location: ProgressLocation.Window,
            title: "Exporting Jar",
            cancellable: true,
        }, (progress, token): Promise<string> => {
            return new Promise<string>(async (resolve, reject) => {
                token.onCancellationRequested(() => {
                    reject();
                });
                progress.report({ increment: 10, message: "Building workspace..." });
                if (await buildWorkspace() === false) {
                    return reject();
                }
                this.mainMethods = await Jdtls.getMainMethod();
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
                                projectFolder = await this.solveProject(progress, token, pickSteps, node);
                                rootNodes = await Jdtls.getProjects(projectFolder.uri.toString());
                                step = SOLVE_MAINMETHOD;
                                break;
                            }
                            case SOLVE_MAINMETHOD: {
                                pickResult = await this.solveMainMethod(progress, token, pickSteps, projectFolder.uri.fsPath);
                                step = GENERATE_JAR;
                                break;
                            }
                            case GENERATE_JAR: {
                                outputFileName = await this.writingJar(progress, token, pickSteps, rootNodes, pickResult, projectFolder.uri.fsPath);
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
        }).then((message) => { this.successMessage(message); }, () => {});
    }

    private static solveProject(progress, token: CancellationToken, pickSteps: string[], node?: INodeData): Promise<WorkspaceFolder> {
        return new Promise<WorkspaceFolder>((resolve, reject) => {
            if (token.isCancellationRequested) {
                return reject();
            }
            const folders = workspace.workspaceFolders;
            let projectFolder: WorkspaceFolder;
            if (node instanceof WorkspaceNode) {
                folders.forEach((folder) => {
                    if (folder.uri.toString() === node.uri) {
                        return resolve(folder);
                    }
                });
                return reject();
            }
            if (folders && folders.length) {
                if (folders.length === 1) {
                    return resolve(folders[0]);
                }
                progress.report({ increment: 10, message: "Determining project..." });
                const pickNodes: ProjectPickNode[] = [];
                for (const folder of folders) {
                    pickNodes.push(new ProjectPickNode(folder.name, folder.uri.fsPath, folder.uri.fsPath));
                }
                const pickBox = window.createQuickPick<ProjectPickNode>();
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
                this.failMessage("No project found");
                return reject();
            }
        });
    }

    private static writingJar(progress, token: CancellationToken, pickSteps: string[], rootNodes: INodeData[],
                              description: string, outputPath: string): Promise<string> {
        return new Promise(async (resolve, reject) => {
            if (token.isCancellationRequested) {
                return reject();
            } else if (rootNodes === undefined) {
                this.failMessage("No module found in this project");
                return reject();
            }
            progress.report({ increment: 10, message: "Solving classpaths..." });
            let outClassPaths: string[];
            try {
                outClassPaths = await this.generateOutClassPath(pickSteps, rootNodes, outputPath);
            } catch (e) {
                return reject(e);
            }
            const outputFileName = join(outputPath, basename(outputPath) + ".jar");
            progress.report({ increment: 30, message: "Exporting jar..." });
            const exportResult = await Jdtls.exportJar(basename(description), outClassPaths, outputFileName);
            if (exportResult === true) {
                resolve(outputFileName);
            } else {
                reject();
            }
        });
    }

    private static solveMainMethod(progress, token: CancellationToken, pickSteps: string[], projectPath: string): Promise<string> {
        return new Promise<string>(async (resolve, reject) => {
            if (token.isCancellationRequested) {
                return reject();
            }
            progress.report({ increment: 10, message: "Getting main classes..." });
            if (this.mainMethods === undefined || this.mainMethods.length === 0) {
                return resolve("");
            }
            progress.report({ increment: 30, message: "Determining entry main class..." });
            const pickNodes: QuickPickNode[] = [];
            for (const mainMethod of this.mainMethods) {
                if (Uri.file(mainMethod.path).fsPath.includes(projectPath)) {
                    pickNodes.push(new QuickPickNode(this.getName(mainMethod), mainMethod.name));
                }
            }
            if (pickNodes.length === 0) {
                return resolve("");
            } else {
                const pickBox = window.createQuickPick<QuickPickNode>();
                pickNodes.push(new QuickPickNode("No main class", ""));
                pickBox.items = pickNodes;
                pickBox.title = "Export Jar - Determine entry main class";
                pickBox.placeholder = "Select the entry main class...";
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

    private static failMessage(message: string) {
        window.showInformationMessage<Message>(message, new Option(false), new Message("Done", true));
    }

    private static successMessage(outputFileName: string) {
        const openInExplorer: Message = new Message("Reveal in File Explorer");
        window.showInformationMessage<Message>("Successfully exported jar to" + EOL + outputFileName,
            new Option(false), openInExplorer, new Message("Done", true)).then((messageResult) => {
                if (messageResult === openInExplorer) {
                    commands.executeCommand("revealFileInOS", Uri.file(outputFileName));
                }
            });
    }

    private static async generateOutClassPath(pickSteps: string[], rootNodes: INodeData[], projectPath: string): Promise<string[]> {
        return new Promise<string[]>(async (resolve, reject) => {
            const extension: Extension<any> | undefined = extensions.getExtension("redhat.java");
            const extensionApi: any = await extension?.activate();
            const outClassPaths: string[] = [];
            const setUris: Set<string> = new Set<string>();
            const pickDependencies: ElementPickNode[] = [];
            const pickedDependencies: ElementPickNode[] = [];
            for (const rootNode of rootNodes) {
                const modulePaths: ClasspathResult = await extensionApi.getClasspaths(rootNode.uri, { scope: "runtime" });
                this.generateDependList(modulePaths.classpaths, setUris, pickDependencies, projectPath, true);
                this.generateDependList(modulePaths.modulepaths, setUris, pickDependencies, projectPath, true);
                const modulePathsTest: ClasspathResult = await extensionApi.getClasspaths(rootNode.uri, { scope: "test" });
                this.generateDependList(modulePathsTest.classpaths, setUris, pickDependencies, projectPath, false);
                this.generateDependList(modulePathsTest.modulepaths, setUris, pickDependencies, projectPath, false);
            }
            const pickBox = window.createQuickPick<ElementPickNode>();
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

    private static generateDependList(paths: string[], setUris: Set<string>, pickDependencies: ElementPickNode[],
                                      projectPath: string, isRuntime: boolean) {
        paths.forEach((classpath: string) => {
            const extName = extname(classpath);
            const baseName = (extName === ".jar") ? basename(classpath) : classpath.substring(projectPath.length + 1);
            const description = (isRuntime) ? "Runtime" : "Test";
            const type = (extName === ".jar") ? "external" : "internal";
            if (!setUris.has(classpath)) {
                setUris.add(classpath);
                pickDependencies.push(new ElementPickNode(baseName, description, classpath, type, isRuntime));
            }
        });
    }
    private static getName(data: MainMethodInfo) {
        const point = data.name.lastIndexOf(".");
        if (point === -1) {
            return data.name;
        } else {
            return data.name.substring(point + 1);
        }
    }

}

class Option implements MessageOptions {
    constructor(public modal?: boolean) {
    }
}

class Message implements MessageItem {
    constructor(public title: string, public isCloseAffordance?: boolean) {
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
