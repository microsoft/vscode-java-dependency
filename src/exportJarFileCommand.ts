// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { EOL, platform } from "os";
import { commands, Uri, window } from "vscode";
import { sendOperationError } from "vscode-extension-telemetry-wrapper";
import { buildWorkspace } from "./build";
import { IStep } from "./exportJarSteps/IStep";
import { StepGenerateJar } from "./exportJarSteps/StepGenerateJar";
import { StepResolveMainMethod } from "./exportJarSteps/StepResolveMainMethod";
import { StepResolveWorkspace } from "./exportJarSteps/StepResolveWorkspace";
import { isStandardServerReady } from "./extension";
import { INodeData } from "./java/nodeData";

let isExportingJar: boolean = false;

export class StepMetadata {
    public entry?: INodeData;
    public workspaceUri?: Uri;
    public isPickedWorkspace: boolean;
    public projectList?: INodeData[];
    public selectedMainMethod?: string;
    public outputPath?: string;
    public elements: string[];
}

export namespace steps {
    export const stepResolveWorkspace: StepResolveWorkspace = new StepResolveWorkspace();
    export const stepResolveMainMethod: StepResolveMainMethod = new StepResolveMainMethod();
    export const stepGenerateJar: StepGenerateJar = new StepGenerateJar();
    export let currentStep: number = 0;
    export const stepsList: IStep[] = [stepResolveWorkspace, stepResolveMainMethod, stepGenerateJar];
}

export async function createJarFile(node?: INodeData) {
    if (!isStandardServerReady() || isExportingJar) {
        return;
    }
    isExportingJar = true;
    return new Promise<string>(async (resolve, reject) => {
        if (await buildWorkspace() === false) {
            return reject();
        }
        let step: IStep = steps.stepsList[steps.currentStep];
        const stepMetadata: StepMetadata = {
            entry: node,
            isPickedWorkspace: false,
            elements: [],
        };
        while (steps.currentStep < steps.stepsList.length) {
            try {
                step = await step.execute(stepMetadata);
            } catch (err) {
                if (err instanceof Error) {
                    return reject(err.message);
                } else {
                    return reject(err);
                }
            }
        }
        resolve(stepMetadata.outputPath);
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
