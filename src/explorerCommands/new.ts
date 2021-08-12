// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from "fs-extra";
import * as path from "path";
import { commands, languages, QuickPickItem, SnippetString, TextEditor, Uri, window, workspace, WorkspaceEdit, WorkspaceFolder } from "vscode";
import { Commands } from "../../extension.bundle";
import { NodeKind } from "../java/nodeData";
import { DataNode } from "../views/dataNode";
import { checkJavaQualifiedName } from "./utility";

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
        return newUntiledJavaFile();
    }

    const className: string | undefined = await window.showInputBox({
        placeHolder: "Input the class name",
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

async function newUntiledJavaFile(): Promise<void> {
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
    if (!window.activeTextEditor) {
        return "";
    }
    const fileUri: Uri = window.activeTextEditor.document.uri;
    const workspaceFolder: WorkspaceFolder | undefined = workspace.getWorkspaceFolder(fileUri);
    if (!workspaceFolder) {
        return "";
    }

    const filePath: string = window.activeTextEditor.document.uri.fsPath;
    try {
        const result = await commands.executeCommand<ListCommandResult>(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.LIST_SOURCEPATHS);
        if (result && result.data && result.data.length) {
            for (const sourcePath of result.data) {
                if (!path.relative(sourcePath.path, filePath).startsWith("..")) {
                    return path.dirname(window.activeTextEditor.document.uri.fsPath);
                }
            }
        }
    } catch (e) {
        // do nothing
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
            return child.nodeData.kind === NodeKind.PackageRoot;
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

function canCreatePackage(node: DataNode): boolean {
    if (node.nodeData.kind === NodeKind.Project ||
        node.nodeData.kind === NodeKind.PackageRoot ||
        node.nodeData.kind === NodeKind.Package) {
        return true;
    }

    return false;
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

interface ListCommandResult {
    status: boolean;
    message: string;
    data?: SourcePath[];
}

interface SourcePath {
    path: string;
    displayPath: string;
    projectName: string;
    projectType: string;
}
