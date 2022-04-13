// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Uri, window, workspace } from "vscode";
import { sendError } from "vscode-extension-telemetry-wrapper";
import { DataNode } from "../views/dataNode";
import { isMutable } from "./utility";

export async function deleteFiles(node: DataNode | undefined, useTrash: boolean): Promise<void> {
    if (!node?.uri || !isMutable(node)) {
        return;
    }

    const children = await node.getChildren();
    const isFolder = children && children.length !== 0;
    const message = getInformationMessage(node.name, isFolder, useTrash);
    const confirmMessage = useTrash ? "Move to Recycle Bin" : "Delete";

    const answer: string | undefined = await window.showInformationMessage(
        message,
        { modal: true },
        confirmMessage,
    );

    if (answer === confirmMessage) {
        try {
            await workspace.fs.delete(Uri.parse(node.uri), {
                recursive: true,
                useTrash,
            });
        } catch (e) {
            // See: https://github.com/microsoft/vscode-java-dependency/issues/608
            sendError(new Error("Failed to remove files."));
        }
    }
}

function getInformationMessage(name: string, isFolder: boolean, useTrash: boolean): string {
    const folderMsg = isFolder ? " and its contents" : "";
    let msg = `Are you sure you want to ${useTrash ? "" : "permanentely "}delete \'${name}\'${folderMsg}?`;

    if (useTrash) {
        msg += "\n\nYou can restore from the Recycle Bin.";
    }
    return msg;
}
