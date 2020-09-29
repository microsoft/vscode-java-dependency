// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { window, workspace,  Uri } from "vscode";
import { DataNode } from "../views/dataNode";

const confirmMessage = "Move to Recycle Bin";

function getInformationMessage(name: string, isFolder: boolean): string {
    const folderMsg = isFolder ? " and its contents" : "";
    const msg = `Are you sure you want to delete \'${name}\'${folderMsg}?\n`;
    const additionMsg = "You can restore from the Recycle Bin.";
    return msg + additionMsg;
}

export async function deleteFiles(node: DataNode): Promise<void> {
    const children = await node.getChildren();
    const isFolder = children && children.length !== 0;
    const message = getInformationMessage(node.name, isFolder);

    let answer: string | undefined = await window.showInformationMessage(
        message, 
        { modal: true },
        confirmMessage
    );

    if (!answer) {
        return;
    }
    
    if (answer == confirmMessage) {
        workspace.fs.delete(Uri.parse(node.uri), {
            recursive: true,
            useTrash: true
        });
    }
}
