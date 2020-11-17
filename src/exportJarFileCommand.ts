// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { tasks } from "vscode";
import { buildWorkspace } from "./build";
import { ExportJarTaskProvider } from "./exportJarSteps/ExportJarTaskProvider";
import { GenerateJarExecutor } from "./exportJarSteps/GenerateJarExecutor";
import { IExportJarStepExecutor } from "./exportJarSteps/IExportJarStepExecutor";
import { IStepMetadata } from "./exportJarSteps/IStepMetadata";
import { ResolveJavaProjectExecutor } from "./exportJarSteps/ResolveJavaProjectExecutor";
import { ResolveMainClassExecutor } from "./exportJarSteps/ResolveMainClassExecutor";
import { failMessage, successMessage } from "./exportJarSteps/utility";
import { isStandardServerReady } from "./extension";
import { INodeData } from "./java/nodeData";

export enum ExportJarStep {
    ResolveJavaProject = "RESOLVEJAVAPROJECT",
    ResolveMainClass = "RESOLVEMAINCLASS",
    GenerateJar = "GENERATEJAR",
    Finish = "FINISH",
}

const stepMap: Map<ExportJarStep, IExportJarStepExecutor> = new Map<ExportJarStep, IExportJarStepExecutor>([
    [ExportJarStep.ResolveJavaProject, new ResolveJavaProjectExecutor()],
    [ExportJarStep.ResolveMainClass, new ResolveMainClassExecutor()],
    [ExportJarStep.GenerateJar, new GenerateJarExecutor()],
]);

let isExportingJar: boolean = false;

export async function executeExportJarTask(node?: INodeData): Promise<void> {
    if (!isStandardServerReady() || isExportingJar || await buildWorkspace() === false) {
        return;
    }
    const stepMetadata: IStepMetadata = {
        entry: node,
        steps: [],
    };
    try {
        await stepMap.get(ExportJarStep.ResolveJavaProject).execute(stepMetadata);
    } catch (err) {
        if (err) {
            failMessage(`${err}`);
        }
        return;
    }
    tasks.executeTask(ExportJarTaskProvider.getTask(stepMetadata));
    return;
}

export async function createJarFile(stepMetadata: IStepMetadata): Promise<void> {
    isExportingJar = true;
    let step: ExportJarStep = ExportJarStep.ResolveMainClass;
    return new Promise<string>(async (resolve, reject) => {
        while (step !== ExportJarStep.Finish) {
            try {
                step = await stepMap.get(step).execute(stepMetadata);
                if (step === ExportJarStep.ResolveJavaProject) {
                    isExportingJar = false;
                    executeExportJarTask(undefined);
                    return reject();
                }
            } catch (err) {
                return reject(err);
            }
        }
        return resolve(stepMetadata.outputPath);
    }).then((message) => {
        isExportingJar = false;
        successMessage(message);
    }, (err) => {
        isExportingJar = false;
        if (err) {
            failMessage(`${err}`);
        }
    });
}
