// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from "fs-extra";
import * as path from "path";
import { Uri, window, workspace, WorkspaceEdit } from "vscode";
import { Explorer } from "../constants";
import { NodeKind } from "../java/nodeData";
import { isJavaIdentifier, isKeyword } from "../utility";
import { DataNode } from "../views/dataNode";

export async function newJavaClass(node: DataNode): Promise<void> {
    const packageFsPath: string = Uri.parse(node.uri).fsPath;
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

function getNewFilePath(basePath: string, className: string): string {
    if (className.endsWith(".java")) {
        className = className.substr(0, className.length - ".java".length);
    }
    return path.join(basePath, ...className.split(".")) + ".java";
}

export async function newPackage(node: DataNode): Promise<void> {
    let defaultValue: string;
    let packageRootPath: string;
    if (node.nodeData.kind === NodeKind.PackageRoot || node.name === Explorer.DEFAULT_PACKAGE_NAME) {
        defaultValue = "";
        packageRootPath = Uri.parse(node.uri).fsPath;
    } else if (node.nodeData.kind === NodeKind.Package) {
        defaultValue = node.nodeData.name + ".";
        const numberOfSegment: number = node.nodeData.name.split(".").length;
        packageRootPath = path.join(Uri.parse(node.uri).fsPath, ...Array(numberOfSegment).fill(".."));
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

function getNewPackagePath(packageRootPath: string, packageName: string): string {
    return path.join(packageRootPath, ...packageName.split("."));
}

function checkJavaQualifiedName(value: string): string {
    if (!value || !value.trim()) {
        return "Input cannot be empty.";
    }

    for (const part of value.split(".")) {
        if (isKeyword(part)) {
            return `Keyword '${part}' cannot be used.`;
        }

        if (!isJavaIdentifier(part)) {
            return `Invalid Java qualified name.`;
        }
    }

    return "";
}
