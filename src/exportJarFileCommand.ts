// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { tasks } from "vscode";
import { buildWorkspace } from "./build";
import { ExportJarTaskProvider } from "./exportJarSteps/ExportJarTaskProvider";
import { GenerateJarExecutor } from "./exportJarSteps/GenerateJarExecutor";
import { IExportJarStepExecutor } from "./exportJarSteps/IExportJarStepExecutor";
import { IStepMetadata } from "./exportJarSteps/IStepMetadata";
import { ResolveJavaProjectExecutor } from "./exportJarSteps/ResolveJavaProjectExecutor";
import { ResolveMainMethodExecutor } from "./exportJarSteps/ResolveMainMethodExecutor";
import { failMessage, successMessage } from "./exportJarSteps/utility";
import { isStandardServerReady } from "./extension";
import { INodeData } from "./java/nodeData";

export enum ExportJarStep {
    ResolveJavaProject = "RESOLVEJAVAPROJECT",
    ResolveMainMethod = "RESOLVEMAINMETHOD",
    GenerateJar = "GENERATEJAR",
    Finish = "FINISH",
}

const stepMap: Map<ExportJarStep, IExportJarStepExecutor> = new Map<ExportJarStep, IExportJarStepExecutor>([
    [ExportJarStep.ResolveJavaProject, new ResolveJavaProjectExecutor()],
    [ExportJarStep.ResolveMainMethod, new ResolveMainMethodExecutor()],
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
    tasks.executeTask(ExportJarTaskProvider.getTask(stepMetadata));
    return;
}

export async function createJarFile(stepMetadata: IStepMetadata) {
    isExportingJar = true;
    let step: ExportJarStep = ExportJarStep.ResolveJavaProject;
    return new Promise<string>(async (resolve, reject) => {
        while (step !== ExportJarStep.Finish) {
            try {
                step = await stepMap.get(step).execute(stepMetadata);
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
