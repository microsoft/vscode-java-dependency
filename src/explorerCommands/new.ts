// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from "fs-extra";
import * as path from "path";
import { QuickPickItem, Uri, window, workspace, WorkspaceEdit } from "vscode";
import { NodeKind } from "../java/nodeData";
import { DataNode } from "../views/dataNode";
import { checkJavaQualifiedName } from "./utility";

export async function newJavaClass(node: DataNode): Promise<void> {
    const packageFsPath: string = await getPackageFsPath(node);
    if (!packageFsPath) {
        return;
    }

    const className: string | undefined = await window.showInputBox({
        placeHolder: "Input the class name",
        ignoreFocusOut: true,
        validateInput: async (value: string): Promise<string> => {
            const checkMessage: string = checkJavaQualifiedName(value);
            if (checkMessage) {
                return checkMessage;
            }

            if (await fse.pathExists(getNewFilePath(packageFsPath, value))) {
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

async function getPackageFsPath(node: DataNode): Promise<string> {
    if (node.nodeData.kind === NodeKind.Project) {
        const childrenNodes: DataNode[] = await node.getChildren() as DataNode[];
        const packageRoots: any[] = childrenNodes.filter((child) => {
            return child.nodeData.kind === NodeKind.PackageRoot;
        });
        if (packageRoots.length < 1) {
            // This might happen for an invisible project with "_" as its root
            const packageNode: DataNode = childrenNodes.find((child) => {
                return child.nodeData.kind === NodeKind.Package;
            });
            if (packageNode) {
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
            return choice ? choice.fsPath : "";
        }
    }

    return Uri.parse(node.uri).fsPath;
}

function getNewFilePath(basePath: string, className: string): string {
    if (className.endsWith(".java")) {
        className = className.substr(0, className.length - ".java".length);
    }
    return path.join(basePath, ...className.split(".")) + ".java";
}

export async function newPackage(node: DataNode): Promise<void> {
    let defaultValue: string;
    let packageRootPath: string;
    const nodeKind = node.nodeData.kind;
    if (nodeKind === NodeKind.Project) {
        defaultValue = "";
        packageRootPath = await getPackageFsPath(node);
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
