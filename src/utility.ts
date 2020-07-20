// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, Extension, extensions, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { setUserError } from "vscode-extension-telemetry-wrapper";
import { logger, Type } from "./logger";
const JAVA_EXTENSION_ID = "redhat.java";
const TROUBLESHOOTING_LINK = "https://github.com/Microsoft/vscode-java-debug/blob/master/Troubleshooting.md";

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

export function getJavaExtension(): Extension<any> {
    return extensions.getExtension(JAVA_EXTENSION_ID);
}

export class JavaExtensionNotEnabledError extends Error {
    constructor(message) {
        super(message);
        setUserError(this);
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

export function openTroubleshootingPage(message: string, anchor: string) {
    commands.executeCommand("vscode.open", Uri.parse(anchor ? `${TROUBLESHOOTING_LINK}#${anchor}` : TROUBLESHOOTING_LINK));
    logger.log(Type.USAGEDATA, {
        troubleshooting: "yes",
        troubleshootingMessage: message,
    });
}
