// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { pathExists } from "fs-extra";
import { EOL, platform } from "os";
import { basename, extname, join } from "path";
import { commands, Extension, extensions, ProgressLocation, QuickInputButtons, QuickPick, QuickPickItem, Uri, window, workspace } from "vscode";
import { sendOperationError } from "vscode-extension-telemetry-wrapper";
import { buildWorkspace } from "./build";
import { GenerateJarStep } from "./exportJarSteps/GenerateJarStep";
import { ExportSteps, IStep } from "./exportJarSteps/IStep";
import { ResolveMainMethodStep } from "./exportJarSteps/ResolveMainMethodStep";
import { ResolveWorkspaceStep } from "./exportJarSteps/ResolveWorkspaceStep";
import { isStandardServerReady } from "./extension";
import { Jdtls } from "./java/jdtls";
import { INodeData } from "./java/nodeData";

let isExportingJar: boolean = false;

export class GenerateSettings {
    public entry?: INodeData;
    public workspaceUri?: Uri;
    public projectList?: INodeData[];
    public selectedMainMethod?: string;
    public outputPath?: string;
    public elements: string[];
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
        const pickSteps: string[] = [];
        let step: ExportSteps = ExportSteps.ResolveWorkspace;
        const resolveWorkspaceStep: ResolveWorkspaceStep = new ResolveWorkspaceStep();
        const resolveMainMethodStep: ResolveMainMethodStep = new ResolveMainMethodStep();
        const generateJarStep: GenerateJarStep = new GenerateJarStep();
        const generateSettings: GenerateSettings = {
            entry: node,
            elements: [],
        };
        while (step !== ExportSteps.Finish) {
            try {
                switch (step) {
                    case ExportSteps.ResolveWorkspace: {
                        step = await resolveWorkspaceStep.execute(undefined, generateSettings);
                        break;
                    }
                    case ExportSteps.ResolveMainMethod: {
                        step = await resolveMainMethodStep.execute(resolveWorkspaceStep, generateSettings);
                        break;
                    }
                    case ExportSteps.GenerateJar: {
                        step = await generateJarStep.execute(resolveMainMethodStep, generateSettings);
                        break;
                    }
                }
            } catch (err) {
                if (err instanceof Error) {
                    return reject(err.message);
                } else {
                    return reject(err);
                }
            }
        }
        resolve(generateSettings.outputPath);
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
