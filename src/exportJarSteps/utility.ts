// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { EOL, platform } from "os";
import { posix, win32 } from "path";
import { commands, Extension, extensions, QuickInputButtons, QuickPick, QuickPickItem, SaveDialogOptions, Uri, window } from "vscode";
import { sendOperationError } from "vscode-extension-telemetry-wrapper";
import { ExportJarStep } from "../exportJarFileCommand";
import { IStepMetadata } from "./IStepMetadata";

export namespace ExportJarTargets {
    export const SETTING_ASKUSER: string = "askUser";
    // tslint:disable-next-line: no-invalid-template-strings
    export const DEFAULT_OUTPUT_PATH: string = "${workspaceFolder}/${workspaceFolderBasename}.jar";
}

export namespace ExportJarConstants {
    export const RUNTIME_DEPENDENCIES: string = "runtimeDependencies";
    export const TEST_DEPENDENCIES: string = "testDependencies";
    export const COMPILE_OUTPUT: string = "compileOutput";
    export const TESTCOMPILE_OUTPUT: string = "testCompileOutput";
}

export function resetStepMetadata(resetTo: ExportJarStep, stepMetadata: IStepMetadata): void {
    if (resetTo === ExportJarStep.ResolveJavaProject) {
        stepMetadata.workspaceFolder = undefined;
        stepMetadata.projectList = undefined;
        stepMetadata.mainMethod = undefined;
    } else if (resetTo === ExportJarStep.ResolveMainMethod) {
        stepMetadata.mainMethod = undefined;
    }
}

export function createPickBox<T extends QuickPickItem>(title: string, placeholder: string, items: T[],
                                                       backBtnEnabled: boolean, canSelectMany: boolean = false): QuickPick<T> {
    const pickBox = window.createQuickPick<T>();
    pickBox.title = title;
    pickBox.placeholder = placeholder;
    pickBox.canSelectMany = canSelectMany;
    pickBox.items = items;
    pickBox.ignoreFocusOut = true;
    pickBox.buttons = backBtnEnabled ? [(QuickInputButtons.Back)] : [];
    return pickBox;
}

export interface IMessageOption {
    title: string;
    command: string;
    arguments?: any;
}

export async function saveDialog(workSpaceUri: Uri, title: string): Promise<Uri> {
    const options: SaveDialogOptions = {
        saveLabel: title,
        defaultUri: workSpaceUri,
        filters: {
            "Java Archive": ["jar"],
        },
    };
    return Promise.resolve(await window.showSaveDialog(options));
}

export function failMessage(message: string, option?: IMessageOption) {
    sendOperationError("", "Export Jar", new Error(message));
    if (option === undefined) {
        window.showErrorMessage(message, "Done");
    } else {
        window.showErrorMessage(message, option.title, "Done").then((result) => {
            if (result === option.title) {
                if (option.arguments === undefined) {
                    commands.executeCommand(option.command);
                } else {
                    commands.executeCommand(option.command, ...option.arguments);
                }
            }
        });
    }
}

export function successMessage(outputFileName: string) {
    let openInExplorer: string;
    if (platform() === "win32") {
        openInExplorer = "Reveal in File Explorer";
    } else if (platform() === "darwin") {
        openInExplorer = "Reveal in Finder";
    } else {
        openInExplorer = "Open Containing Folder";
    }
    window.showInformationMessage("Successfully exported jar to" + EOL + outputFileName,
        openInExplorer, "Done").then((messageResult) => {
            if (messageResult === openInExplorer) {
                commands.executeCommand("revealFileInOS", Uri.file(outputFileName));
            }
        });
}

export function toPosixPath(inputPath: string): string {
    return inputPath.split(win32.sep).join(posix.sep);
}

export function toWinPath(inputPath: string): string {
    return inputPath.split(posix.sep).join(win32.sep);
}

export async function getExtensionApi(): Promise<any> {
    const extension: Extension<any> | undefined = extensions.getExtension("redhat.java");
    if (extension === undefined) {
        throw new Error("Language Support for Java(TM) by Red Hat isn't running, the export process will be aborted.");
    }
    const extensionApi: any = await extension.activate();
    if (extensionApi.getClasspaths === undefined) {
        throw new Error("Export jar is not supported in the current version of language server, please check and update your Language Support for Java(TM) by Red Hat.");
    }
    return extensionApi;
}
