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
import { ErrorWithHandler, failMessage, successMessage } from "./exportJarSteps/utility";
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

export async function createJarFileEntry(node?: INodeData): Promise<boolean> {
    if (!isStandardServerReady() || await buildWorkspace() === false || isExportingJar) {
        return;
    }
    isExportingJar = true;
    const step: ExportJarStep = ExportJarStep.ResolveJavaProject;
    const stepMetadata: IStepMetadata = {
        entry: node,
        steps: [],
    };
    try {
        await stepMap.get(step).execute(stepMetadata);
    } catch (err) {
        isExportingJar = false;
        if (err) {
            failMessage(`${err}`);
        }
        return true;
    }
    tasks.executeTask(ExportJarTaskProvider.getTask(stepMetadata)); // async
    return new Promise<boolean>((resolve, reject) => {
        tasks.onDidEndTask((e) => {
            if (e.execution.task.source === ExportJarTaskProvider.exportJarType) {
                isExportingJar = false;
                if (stepMetadata.workspaceFolder === undefined) {
                    resolve(false);
                } else {
                    resolve(true);
                }
            }
        });
    });
}

export async function createJarFile(stepMetadata: IStepMetadata) {
    let step: ExportJarStep = ExportJarStep.ResolveMainMethod;
    return new Promise<string>(async (resolve, reject) => {
        while (step !== ExportJarStep.Finish) {
            try {
                step = await stepMap.get(step).execute(stepMetadata);
                if (step === ExportJarStep.ResolveJavaProject) {
                    return reject();
                }
            } catch (err) {
                return reject(err);
            }
        }
        return resolve(stepMetadata.outputPath);
    }).then((message) => {
        successMessage(message);
    }, (err) => {
        if (err instanceof ErrorWithHandler) {
            failMessage(err.message, err.handler);
        } else if (err) {
            failMessage(`${err}`);
        }
    });
}
