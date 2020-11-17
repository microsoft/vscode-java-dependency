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
import { failMessage } from "./exportJarSteps/utility";
import { isStandardServerReady } from "./extension";
import { INodeData } from "./java/nodeData";

export enum ExportJarStep {
    ResolveJavaProject = "RESOLVEJAVAPROJECT",
    ResolveMainClass = "RESOLVEMAINCLASS",
    GenerateJar = "GENERATEJAR",
    Finish = "FINISH",
}

export const stepMap: Map<ExportJarStep, IExportJarStepExecutor> = new Map<ExportJarStep, IExportJarStepExecutor>([
    [ExportJarStep.ResolveJavaProject, new ResolveJavaProjectExecutor()],
    [ExportJarStep.ResolveMainClass, new ResolveMainClassExecutor()],
    [ExportJarStep.GenerateJar, new GenerateJarExecutor()],
]);

let isExportingJar: boolean = false;

export async function executeExportJarTask(node?: INodeData): Promise<void> {
    if (!isStandardServerReady() || isExportingJar || await buildWorkspace() === false) {
        return;
    }
    isExportingJar = true;
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
        isExportingJar = false;
        return;
    }
    tasks.executeTask(ExportJarTaskProvider.getTask(stepMetadata));
}

export async function finishExportJarTask(restart: boolean, node?: INodeData): Promise<void> {
    isExportingJar = false;
    if (restart) {
        executeExportJarTask(node);
    }
}
