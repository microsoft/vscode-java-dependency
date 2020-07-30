// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { EOL, platform } from "os";
import { commands, Uri, window } from "vscode";
import { sendOperationError } from "vscode-extension-telemetry-wrapper";
import { buildWorkspace } from "./build";
import { GenerateJarExecutor } from "./exportJarSteps/GenerateJarExecutor";
import { IExportJarStepExecutor } from "./exportJarSteps/IExportJarStepExecutor";
import { ResolveMainMethodExecutor } from "./exportJarSteps/ResolveMainMethodExecutor";
import { ResolveWorkspaceExecutor } from "./exportJarSteps/ResolveWorkspaceExecutor";
import { isStandardServerReady } from "./extension";
import { INodeData } from "./java/nodeData";

export interface IStepMetadata {
    entry?: INodeData;
    workspaceUri?: Uri;
    isPickedWorkspace: boolean;
    projectList?: INodeData[];
    selectedMainMethod?: string;
    outputPath?: string;
    elements: string[];
}

export enum ExportJarStep {
    ResolveWorkspace = "RESOLVEWORKSPACE",
    ResolveMainMethod = "RESOLVEMAINMETHOD",
    GenerateJar = "GENERATEJAR",
    Finish = "FINISH",
}

let isExportingJar: boolean = false;
const stepMap: Map<ExportJarStep, IExportJarStepExecutor> = new Map<ExportJarStep, IExportJarStepExecutor>([
    [ExportJarStep.ResolveWorkspace, new ResolveWorkspaceExecutor()],
    [ExportJarStep.ResolveMainMethod, new ResolveMainMethodExecutor()],
    [ExportJarStep.GenerateJar, new GenerateJarExecutor()],
]);

export async function createJarFile(node?: INodeData) {
    if (!isStandardServerReady() || isExportingJar) {
        return;
    }
    isExportingJar = true;
    return new Promise<string>(async (resolve, reject) => {
        if (await buildWorkspace() === false) {
            return reject();
        }
        let step: ExportJarStep = ExportJarStep.ResolveWorkspace;
        const stepMetadata: IStepMetadata = {
            entry: node,
            isPickedWorkspace: false,
            elements: [],
        };
        while (step !== ExportJarStep.Finish) {
            try {
                step = await stepMap.get(step).execute(stepMetadata);
            } catch (err) {
                return err ? reject(`${err}`) : reject();
            }
        }
        return resolve(stepMetadata.outputPath);
    }).then((message) => {
        successMessage(message);
        isExportingJar = false;
    }, (err) => {
        failMessage(err);
        isExportingJar = false;
    });
}

function failMessage(message: string) {
    sendOperationError("", "Export Jar", new Error(message));
    window.showErrorMessage(message, "Done");
}

function successMessage(outputFileName: string) {
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
