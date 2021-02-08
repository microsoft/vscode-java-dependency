// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Uri, window, workspace, WorkspaceFolder } from "vscode";
import { setUserError } from "vscode-extension-telemetry-wrapper";
import { INodeData } from "./java/nodeData";
import { languageServerApiManager } from "./languageServerApi/languageServerApiManager";
import { Settings } from "./settings";

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

    public static async isRevealable(uri: Uri): Promise<boolean> {
        if (!SUPPORTED_URI_SCHEMES.includes(uri.scheme)) {
            return false;
        }
        if (uri.scheme === "file" && !workspace.getWorkspaceFolder(uri)) {
            return false;
        }
        if (!await languageServerApiManager.isStandardServerReady()) {
            return false;
        }
        return true;
    }

}

export class EventCounter {
    public static dict: {[key: string]: number} = {};

    public static increase(event: string) {
        const count = this.dict[event] ?? 0;
        this.dict[event] = count + 1;
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

const keywords: Set<string> = new Set([
    "abstract", "default", "if", "private", "this", "boolean", "do", "implements", "protected", "throw", "break", "double", "import",
    "public", "throws", "byte", "else", "instanceof", "return", "transient", "case", "extends", "int", "short", "try", "catch", "final",
    "interface", "static", "void", "char", "finally", "long", "strictfp", "volatile", "class", "float", "native", "super", "while",
    "const", "for", "new", "switch", "continue", "goto", "package", "synchronized", "true", "false", "null", "assert", "enum",
]);

const SUPPORTED_URI_SCHEMES: string[] = ["file", "jdt"];

export function isKeyword(identifier: string): boolean {
    return keywords.has(identifier);
}

const identifierRegExp: RegExp = /^([a-zA-Z_$][a-zA-Z\d_$]*)$/;
export function isJavaIdentifier(identifier: string): boolean {
    return identifierRegExp.test(identifier);
}

export function isTest(nodeData: INodeData | undefined): boolean {
    if (!nodeData) {
        return false;
    }

    if (nodeData.metaData?.test === "true") {
        return true;
    }

    const mavenScope: string = nodeData.metaData?.["maven.scope"] || "";
    if (mavenScope.toLocaleLowerCase().includes("test")) {
        return true;
    }

    const gradleScope: string = nodeData.metaData?.gradle_scope || "";
    if (gradleScope.toLocaleLowerCase().includes("test")) {
        return true;
    }

    return false;
}
