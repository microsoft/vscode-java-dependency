// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from "fs-extra";
import * as path from "path";
import { commands, Extension, extensions, languages, QuickPickItem, SnippetString, TextEditor, Uri,
    window, workspace, WorkspaceEdit, WorkspaceFolder } from "vscode";
import { Commands, PrimaryTypeNode } from "../../extension.bundle";
import { ExtensionName } from "../constants";
import { NodeKind } from "../java/nodeData";
import { DataNode } from "../views/dataNode";
import { resourceRoots } from "../views/packageRootNode";
import { checkJavaQualifiedName } from "./utility";
import { sendError, setUserError } from "vscode-extension-telemetry-wrapper";

export async function newResource(node: DataNode): Promise<void> {
    const availableTypes: string[] = [];
    // add options for Java nodes
    if (node.nodeData.kind === NodeKind.Project ||
            (node.nodeData.kind === NodeKind.PackageRoot && !resourceRoots.includes(node.nodeData.name)) ||
            node.nodeData.kind === NodeKind.Package ||
            node.nodeData.kind === NodeKind.PrimaryType ||
            node.nodeData.kind === NodeKind.CompilationUnit) {
        availableTypes.push("$(symbol-class) Java Class", "$(symbol-namespace) Package");
    }

    // add new file option
    availableTypes.push("$(file) File");

    // add new folder option
    if (node.nodeData.kind === NodeKind.Project ||
            (node.nodeData.kind === NodeKind.PackageRoot && resourceRoots.includes(node.nodeData.name)) ||
            node.nodeData.kind === NodeKind.Folder ||
            node.nodeData.kind === NodeKind.File) {
        availableTypes.push("$(folder) Folder");
    }

    const type = await window.showQuickPick(
        availableTypes,
        {
            placeHolder: "Select resource type to create.",
            ignoreFocusOut: true,
        }
    );

    switch (type) {
        case "$(symbol-class) Java Class":
            await newJavaClass(node);
            break;
        case "$(symbol-namespace) Package":
            await newPackage(node);
            break;
        case "$(file) File":
            await newFile(node);
            break;
        case "$(folder) Folder":
            await newFolder(node);
            break;
        default:
            break;
    }
}

// TODO: separate to two function to handle creation from menu bar and explorer.
export async function newJavaClass(node?: DataNode): Promise<void> {
    let packageFsPath: string | undefined;
    if (!node) {
        packageFsPath = await inferPackageFsPath();
    } else {
        if (!node?.uri || !canCreateClass(node)) {
            return;
        }

        packageFsPath = await getPackageFsPath(node);
    }

    if (packageFsPath === undefined) {
        // User canceled
        return;
    } else if (packageFsPath.length === 0) {
        return newUntitledJavaFile();
    }

    const className: string | undefined = await window.showInputBox({
        placeHolder: "Enter the Java file name for class/interface/enum/record/@interface",
        ignoreFocusOut: true,
        validateInput: async (value: string): Promise<string> => {
            const checkMessage: string = checkJavaQualifiedName(value);
            if (checkMessage) {
                return checkMessage;
            }

            if (await fse.pathExists(getNewFilePath(packageFsPath!, value))) {
                return "Class already exists.";
            }

            return "";
        },
    });

    if (!className) {
        return;
    }

    // `workspace.applyEdit()` will trigger a workspace file event, and let the
    // vscode-java extension to handle the type: class, interface or enum.
    const workspaceEdit: WorkspaceEdit = new WorkspaceEdit();
    const fsPath: string = getNewFilePath(packageFsPath, className);
    workspaceEdit.createFile(Uri.file(fsPath));
    workspace.applyEdit(workspaceEdit);
}

async function newUntitledJavaFile(): Promise<void> {
    await commands.executeCommand("workbench.action.files.newUntitledFile");
    const textEditor: TextEditor | undefined = window.activeTextEditor;
    if (!textEditor) {
        return;
    }
    await languages.setTextDocumentLanguage(textEditor.document, "java");
    const snippets: string[] = [];
    snippets.push(`public \${1|class,interface,enum,abstract class,@interface|} \${2:Main} {`);
    snippets.push(`\t\${0}`);
    snippets.push("}");
    snippets.push("");
    textEditor.insertSnippet(new SnippetString(snippets.join("\n")));
}

async function inferPackageFsPath(): Promise<string> {
    const javaLanguageSupport: Extension<any> | undefined = extensions.getExtension(ExtensionName.JAVA_LANGUAGE_SUPPORT);
    if (!javaLanguageSupport || !javaLanguageSupport.isActive) {
        return "";
    }

    const extensionApi: any = javaLanguageSupport.exports;
    if (!extensionApi) {
        return "";
    }

    if (extensionApi.serverMode !== "Standard" || extensionApi.status !== "Started") {
        return "";
    }

    let sourcePaths: string[] | undefined;
    try {
        const result = await commands.executeCommand<IListCommandResult>(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.LIST_SOURCEPATHS);
        if (result && result.data && result.data.length) {
            sourcePaths = result.data.map((entry) => entry.path);
        }
    } catch (e) {
        // do nothing
    }

    if (!window.activeTextEditor) {
        if (sourcePaths?.length === 1) {
            return sourcePaths[0];
        }
        return "";
    }

    const fileUri: Uri = window.activeTextEditor.document.uri;
    const workspaceFolder: WorkspaceFolder | undefined = workspace.getWorkspaceFolder(fileUri);
    if (!workspaceFolder) {
        return "";
    }

    const filePath: string = window.activeTextEditor.document.uri.fsPath;
    if (sourcePaths) {
        for (const sourcePath of sourcePaths) {
            if (!path.relative(sourcePath, filePath).startsWith("..")) {
                return path.dirname(window.activeTextEditor.document.uri.fsPath);
            }
        }
    }

    return "";
}

function canCreateClass(node: DataNode): boolean {
    if (node.nodeData.kind === NodeKind.Project ||
        node.nodeData.kind === NodeKind.PackageRoot ||
        node.nodeData.kind === NodeKind.Package ||
        node.nodeData.kind === NodeKind.PrimaryType) {
        return true;
    }

    return false;
}

async function getPackageFsPath(node: DataNode): Promise<string | undefined> {
    if (node.nodeData.kind === NodeKind.Project) {
        const childrenNodes: DataNode[] = await node.getChildren() as DataNode[];
        const packageRoots: any[] = childrenNodes.filter((child) => {
            return child.nodeData.kind === NodeKind.PackageRoot && !resourceRoots.includes(child.name);
        });
        if (packageRoots.length < 1) {
            // This might happen for an invisible project with "_" as its root
            const packageNode: DataNode | undefined = childrenNodes.find((child) => {
                return child.nodeData.kind === NodeKind.Package;
            });
            if (!packageNode && node.uri) {
                // This means the .java files are in the default package.
                return Uri.parse(node.uri).fsPath;
            } else if (packageNode?.uri) {
                return getPackageRootPath(Uri.parse(packageNode.uri).fsPath, packageNode.name);
            }
            return "";
        } else if (packageRoots.length === 1) {
            return Uri.parse(packageRoots[0].uri).fsPath;
        } else {
            const options: ISourceRootPickItem[] = packageRoots.map((root) => {
                return {
                    label: root.name,
                    fsPath: Uri.parse(root.uri).fsPath,
                };
            });
            const choice: ISourceRootPickItem | undefined = await window.showQuickPick(options, {
                    placeHolder: "Choose a source folder",
                    ignoreFocusOut: true,
                },
            );
            return choice?.fsPath;
        }
    } else if (node.nodeData.kind === NodeKind.PrimaryType) {
        return node.uri ? path.dirname(Uri.parse(node.uri).fsPath) : "";
    }

    return node.uri ? Uri.parse(node.uri).fsPath : "";
}

function getNewFilePath(basePath: string, className: string): string {
    if (className.endsWith(".java")) {
        className = className.substr(0, className.length - ".java".length);
    }
    return path.join(basePath, ...className.split(".")) + ".java";
}

export async function newPackage(node?: DataNode): Promise<void> {
    if (!node?.uri || !canCreatePackage(node)) {
        return;
    }

    let defaultValue: string;
    let packageRootPath: string;
    const nodeKind = node.nodeData.kind;
    if (nodeKind === NodeKind.Project) {
        defaultValue = "";
        packageRootPath = await getPackageFsPath(node) || "";
    } else if (nodeKind === NodeKind.PackageRoot) {
        defaultValue = "";
        packageRootPath = Uri.parse(node.uri).fsPath;
    } else if (nodeKind === NodeKind.Package) {
        defaultValue = node.nodeData.name + ".";
        packageRootPath = getPackageRootPath(Uri.parse(node.uri).fsPath, node.nodeData.name);
    } else if (nodeKind === NodeKind.PrimaryType) {
        const primaryTypeNode = <PrimaryTypeNode> node;
        packageRootPath = primaryTypeNode.getPackageRootPath();
        if (packageRootPath === "") {
            window.showErrorMessage("Failed to get the package root path.");
            return;
        }
        const packagePath = await getPackageFsPath(node);
        if (!packagePath) {
            window.showErrorMessage("Failed to get the package path.");
            return;
        }
        defaultValue = path.relative(packageRootPath, packagePath).replace(/[\\\/]/g, ".") + ".";
    } else {
        return;
    }

    const packageName: string | undefined = await window.showInputBox({
        value: defaultValue,
        placeHolder: "Input the package name",
        valueSelection: [defaultValue.length, defaultValue.length],
        ignoreFocusOut: true,
        validateInput: async (value: string): Promise<string> => {
            const checkMessage: string = checkJavaQualifiedName(value);
            if (checkMessage) {
                return checkMessage;
            }

            if (await fse.pathExists(getNewPackagePath(packageRootPath, value))) {
                return "Package already exists.";
            }

            return "";
        },
    });

    if (!packageName) {
        return;
    }

    await fse.ensureDir(getNewPackagePath(packageRootPath, packageName));
}

/**
 * Check if the create package command is available for the given node.
 * Currently the check logic is the same as the create class command.
 */
function canCreatePackage(node: DataNode): boolean {
    return canCreateClass(node);
}

function getPackageRootPath(packageFsPath: string, packageName: string): string {
    const numberOfSegment: number = packageName.split(".").length;
    return path.join(packageFsPath, ...Array(numberOfSegment).fill(".."));
}

function getNewPackagePath(packageRootPath: string, packageName: string): string {
    return path.join(packageRootPath, ...packageName.split("."));
}

interface ISourceRootPickItem extends QuickPickItem {
    fsPath: string;
}

interface IListCommandResult {
    status: boolean;
    message: string;
    data?: ISourcePath[];
}

interface ISourcePath {
    path: string;
    displayPath: string;
    projectName: string;
    projectType: string;
}

export async function newFile(node: DataNode): Promise<void> {
    const basePath = getBasePath(node);
    if (!basePath) {
        window.showErrorMessage("The selected node is invalid.");
        return;
    }

    const fileName: string | undefined = await window.showInputBox({
        placeHolder: "Input the file name",
        ignoreFocusOut: true,
        validateInput: async (value: string): Promise<string> => {
            return validateNewFileFolder(basePath, value);
        },
    });

    if (!fileName) {
        return;
    }

    // any continues separator will be deduplicated.
    const relativePath = fileName.replace(/[/\\]+/g, path.sep);
    const newFilePath = path.join(basePath, relativePath);
    await createFile(newFilePath);
}

async function createFile(newFilePath: string) {
    fse.createFile(newFilePath, async (err: Error) => {
        if (err) {
            setUserError(err);
            sendError(err);
            const choice = await window.showErrorMessage(
                err.message || "Failed to create file: " + path.basename(newFilePath),
                "Retry"
            );
            if (choice === "Retry") {
                await createFile(newFilePath);
            }
        } else {
            window.showTextDocument(Uri.file(newFilePath));
        }
    });
}

export async function newFolder(node: DataNode): Promise<void> {
    const basePath = getBasePath(node);
    if (!basePath) {
        window.showErrorMessage("The selected node is invalid.");
        return;
    }

    const folderName: string | undefined = await window.showInputBox({
        placeHolder: "Input the folder name",
        ignoreFocusOut: true,
        validateInput: async (value: string): Promise<string> => {
            return validateNewFileFolder(basePath, value);
        },
    });

    if (!folderName) {
        return;
    }

    // any continues separator will be deduplicated.
    const relativePath = folderName.replace(/[/\\]+/g, path.sep);
    const newFolderPath = path.join(basePath, relativePath);
    fse.mkdirs(newFolderPath);
}

async function validateNewFileFolder(basePath: string, relativePath: string): Promise<string> {
    relativePath = relativePath.replace(/[/\\]+/g, path.sep);
    if (await fse.pathExists(path.join(basePath, relativePath))) {
        return "A file or folder already exists in the target location.";
    }

    return "";
}

function getBasePath(node: DataNode): string | undefined {
    if (!node.uri) {
        return undefined;
    }

    const uri: Uri = Uri.parse(node.uri);
    if (uri.scheme !== "file") {
        return undefined;
    }

    const nodeKind = node.nodeData.kind;
    switch (nodeKind) {
        case NodeKind.Project:
        case NodeKind.PackageRoot:
        case NodeKind.Package:
        case NodeKind.Folder:
            return Uri.parse(node.uri!).fsPath;
        case NodeKind.PrimaryType:
        case NodeKind.File:
            return path.dirname(Uri.parse(node.uri).fsPath);
        default:
            return undefined;
    }
}
