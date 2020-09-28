// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { window, workspace,  Uri } from "vscode";
import { DataNode } from "../views/dataNode";

const deleteOptions = {
    recursive: true,
    useTrash: true
}

const userActions = {
    confirm: "Move to Recycle Bin",
    cancel: "Cancel"
}

function getInformationMessage(name: string, isFolder: boolean): string {
    const folderMsg = isFolder ? " and its contents" : "";
    const msg = `Are you sure you want to delete \'${name}\'${folderMsg}? `;
    const additionMsg = "You can restore from the Recycle Bin.";
    return msg + additionMsg;
}

export async function deleteFiles(node: DataNode): Promise<void> {
    const children = await node.getChildren();
    const isFolder = children && children.length !== 0;
    const message = getInformationMessage(node.name, isFolder);
    const actions = [userActions.confirm, userActions.cancel];

    let answer: string | undefined = await window.showInformationMessage(message, ...actions);

    if (!answer) {
        return;
    }
    
    if (answer == userActions.confirm) {
        workspace.fs.delete(Uri.parse(node.uri), deleteOptions);
    }
}
