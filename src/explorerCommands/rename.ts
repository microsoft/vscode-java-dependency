// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import { Uri, window, workspace, WorkspaceEdit } from "vscode";
import { DataNode } from "../views/dataNode";
import { ExplorerNode } from "../views/explorerNode";
import { isMutable } from "./utils";

export async function renameFile(node: DataNode, selectedNode: ExplorerNode): Promise<void> {
    // if command not invoked by context menu, use selected node in explorer
    if (!node) {
        node = selectedNode as DataNode;
        if (!isMutable(node)) {
            return;
        }
    }

    const newName: string | undefined = await window.showInputBox({
        placeHolder: "Input new file name",
        value: node.name,
        ignoreFocusOut: true,
    });

    if (!newName) {
        return;
    }

    const oldFsPath = Uri.parse(node.uri).fsPath;
    const renamedFilePath = getRenamedFilePath(oldFsPath, newName);

    const workspaceEdit: WorkspaceEdit = new WorkspaceEdit();
    workspaceEdit.renameFile(Uri.file(oldFsPath), Uri.file(renamedFilePath));
    workspace.applyEdit(workspaceEdit);
}

function getRenamedFilePath(oldUri: string, newName: string): string {
    // preserve default file extension if not provided
    if (!path.extname(newName)) {
        newName += path.extname(oldUri);
    }
    const dirname = path.dirname(oldUri);
    return path.join(dirname, newName);
}
