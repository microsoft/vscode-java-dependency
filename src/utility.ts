// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { window, workspace, WorkspaceFolder } from "vscode";

export class Utility {

    public static getDefaultWorkspaceFolder(): WorkspaceFolder | undefined {
        if (workspace.workspaceFolders === undefined) {
            return undefined;
        }
        if (workspace.workspaceFolders.length === 1) {
            return workspace.workspaceFolders[0];
        }
        if (window.activeTextEditor) {
            const activeWorkspaceFolder: WorkspaceFolder | undefined = workspace.getWorkspaceFolder(window.activeTextEditor.document.uri);
            return activeWorkspaceFolder;
        }
        return undefined;
    }
}
