// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { window, workspace, WorkspaceFolder } from "vscode";
import { setUserError } from "vscode-extension-telemetry-wrapper";

export class Utility {

    public static getDefaultWorkspaceFolder(): WorkspaceFolder | undefined {
        if (workspace.workspaceFolders === undefined) {
            return undefined;
        }
        if (workspace.workspaceFolders.length === 1) {
            return workspace.workspaceFolders[0];
        }
        if (window.activeTextEditor) {
            const activeWorkspaceFolder: WorkspaceFolder | undefined =
                workspace.getWorkspaceFolder(window.activeTextEditor.document.uri);
            return activeWorkspaceFolder;
        }
        return undefined;
    }

}

export class UserError extends Error {
    public context: ITroubleshootingMessage;

    constructor(context: ITroubleshootingMessage) {
        super(context.message);
        this.context = context;
        setUserError(this);
    }
}

interface IProperties {
    [key: string]: string;
}

interface ILoggingMessage {
    message: string;
    type?: Type;
    details?: IProperties;
}

interface ITroubleshootingMessage extends ILoggingMessage {
    anchor?: string;
}

export enum Type {
    EXCEPTION = "exception",
    USAGEDATA = "usageData",
    USAGEERROR = "usageError",
    ACTIVATEEXTENSION = "activateExtension", // TODO: Activation belongs to usage data, remove this category.
}
