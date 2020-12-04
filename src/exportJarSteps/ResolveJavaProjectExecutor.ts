// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import { Disposable, QuickPickItem, Uri, workspace, WorkspaceFolder } from "vscode";
import { Jdtls } from "../java/jdtls";
import { INodeData } from "../java/nodeData";
import { WorkspaceNode } from "../views/workspaceNode";
import { IExportJarStepExecutor } from "./IExportJarStepExecutor";
import { IStepMetadata } from "./IStepMetadata";
import { createPickBox, ExportJarStep } from "./utility";

export class ResolveJavaProjectExecutor implements IExportJarStepExecutor {

    public getNextStep(): ExportJarStep {
        return ExportJarStep.ResolveMainClass;
    }

    public async execute(stepMetadata: IStepMetadata): Promise<ExportJarStep> {
        if (stepMetadata.workspaceFolder === undefined) {
            await this.resolveJavaProject(stepMetadata);
        }
        return this.getNextStep();
    }

    private async resolveJavaProject(stepMetadata: IStepMetadata): Promise<void> {
        const folders = workspace.workspaceFolders!;
        if (stepMetadata.entry instanceof WorkspaceNode) {
            const workspaceUri: Uri = Uri.parse(stepMetadata.entry.uri!);
            for (const folder of workspace.workspaceFolders!) {
                if (folder.uri.toString() === workspaceUri.toString()) {
                    stepMetadata.workspaceFolder = folder;
                }
            }
            stepMetadata.projectList = await Jdtls.getProjects(workspaceUri.toString());
            return;
        }
        // Guarded by workspaceFolderCount != 0 in package.json
        if (folders.length === 1) {
            stepMetadata.workspaceFolder = folders[0];
            stepMetadata.projectList = await Jdtls.getProjects(folders[0].uri.toString());
            return;
        }
        const pickItems: IJavaProjectQuickPickItem[] = [];
        const projectMap: Map<string, INodeData[]> = new Map<string, INodeData[]>();
        for (const folder of folders) {
            const projects: INodeData[] | undefined = await Jdtls.getProjects(folder.uri.toString());
            if (!_.isEmpty(projects)) {
                pickItems.push({
                    label: folder.name,
                    description: folder.uri.fsPath,
                    workspaceFolder: folder,
                });
                projectMap.set(folder.uri.toString(), projects!);
            }
        }
        if (_.isEmpty(pickItems)) {
            throw new Error("No java project found. Please make sure your Java project exists in the workspace.");
        }
        const disposables: Disposable[] = [];
        try {
            await new Promise((resolve, reject) => {
                const pickBox = createPickBox<IJavaProjectQuickPickItem>("Export Jar : Determine workspace",
                    "Select the workspace", pickItems, false);
                disposables.push(
                    pickBox.onDidAccept(() => {
                        if (_.isEmpty(pickBox.selectedItems)) {
                            return;
                        }
                        stepMetadata.projectList = projectMap.get(pickBox.selectedItems[0].workspaceFolder.uri.toString());
                        stepMetadata.workspaceFolder = pickBox.selectedItems[0].workspaceFolder;
                        stepMetadata.steps.push(ExportJarStep.ResolveJavaProject);
                        return resolve();
                    }),
                    pickBox.onDidHide(() => {
                        return reject();
                    }),
                );
                disposables.push(pickBox);
                pickBox.show();
            });
        } finally {
            for (const d of disposables) {
                d.dispose();
            }
        }
    }
}

interface IJavaProjectQuickPickItem extends QuickPickItem {
    workspaceFolder: WorkspaceFolder;
}
