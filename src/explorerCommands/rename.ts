// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from "fs-extra";
import * as path from "path";
import { Uri, window, workspace, WorkspaceEdit } from "vscode";
import { NodeKind } from "../java/nodeData";
import { DataNode } from "../views/dataNode";
import { checkJavaQualifiedName } from "./utility";

export async function renameFile(node: DataNode): Promise<void> {
    const oldFsPath = Uri.parse(node.uri).fsPath;

    const newName: string | undefined = await window.showInputBox({
        placeHolder: "Input new file name",
        value: getPrefillValue(node),
        ignoreFocusOut: true,
        valueSelection: getValueSelection(node.uri),
        validateInput: async (value: string): Promise<string> => {
            const checkMessage = CheckQualifiedInputName(value, node.nodeData.kind);
            if (checkMessage) {
                return checkMessage;
            }

            const inputFsPath = getRenamedFsPath(oldFsPath, value);
            if (await fse.pathExists(inputFsPath)) {
                return `File path: ${inputFsPath} already exists.`;
            }

            return "";
        },
    });

    if (!newName) {
        return;
    }

    const newFsPath = getRenamedFsPath(oldFsPath, newName);
    const workspaceEdit: WorkspaceEdit = new WorkspaceEdit();
    workspaceEdit.renameFile(Uri.file(oldFsPath), Uri.file(newFsPath));
    workspace.applyEdit(workspaceEdit);
}

function getRenamedFsPath(oldUri: string, newName: string): string {
    // preserve default file extension if not provided
    if (!path.extname(newName)) {
        newName += path.extname(oldUri);
    }
    const dirname = path.dirname(oldUri);
    return path.join(dirname, newName);
}

function getPrefillValue(node: DataNode): string {
    const nodeKind = node.nodeData.kind;
    if (nodeKind === NodeKind.PrimaryType) {
        return node.name;
    }
    return path.basename(node.uri);
}

function getValueSelection(uri: string): [number, number] | undefined {
    const pos = path.basename(uri).lastIndexOf(".");
    if (pos !== -1) {
        return [0, pos];
    }
    return undefined;
}

function CheckQualifiedInputName(value: string, nodeKind: NodeKind): string {
    const javaValidateMessage = checkJavaQualifiedName(value);

    if (javaValidateMessage) {
        return javaValidateMessage;
    }

    if (nodeKind === NodeKind.Package || nodeKind === NodeKind.PackageRoot) {
        if (value.indexOf(".") !== -1) {
            return "Rename is only applicable to innermost package.";
        }
    }

    return "";
}
