// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import { Disposable, QuickPickItem, Uri, workspace, WorkspaceFolder } from "vscode";
import { ExportJarStep } from "../exportJarFileCommand";
import { Jdtls } from "../java/jdtls";
import { INodeData } from "../java/nodeData";
import { WorkspaceNode } from "../views/workspaceNode";
import { IExportJarStepExecutor } from "./IExportJarStepExecutor";
import { IStepMetadata } from "./IStepMetadata";
import { createPickBox } from "./utility";

export class ResolveJavaProjectExecutor implements IExportJarStepExecutor {

    public getNextStep(): ExportJarStep {
        return ExportJarStep.ResolveMainMethod;
    }

    public async execute(stepMetadata: IStepMetadata): Promise<ExportJarStep> {
        await this.resolveJavaProject(stepMetadata);
        return this.getNextStep();
    }

    private async setWorkspaceFolder(stepMetadata: IStepMetadata, uri: Uri): Promise<void> {
        stepMetadata.projectList = await Jdtls.getProjects(uri.toString());
        const folders = workspace.workspaceFolders;
        for (const folder of folders) {
            if (folder.uri.toString() === uri.toString()) {
                stepMetadata.workspaceFolder = folder;
            }
        }
    }

    private async resolveJavaProject(stepMetadata: IStepMetadata): Promise<void> {
        if (stepMetadata.entry instanceof WorkspaceNode) {
            await this.setWorkspaceFolder(stepMetadata, Uri.parse(stepMetadata.entry.uri));
            return;
        }
        const folders = workspace.workspaceFolders;
        // Guarded by workspaceFolderCount != 0 in package.json
        if (folders.length === 1) {
            await this.setWorkspaceFolder(stepMetadata, folders[0].uri);
            return;
        }
        const pickItems: IJavaProjectQuickPickItem[] = [];
        const projectMap: Map<string, INodeData[]> = new Map<string, INodeData[]>();
        for (const folder of folders) {
            const projects: INodeData[] = await Jdtls.getProjects(folder.uri.toString());
            if (!_.isEmpty(projects)) {
                pickItems.push({
                    label: folder.name,
                    description: folder.uri.fsPath,
                    workspaceFolder: folder,
                });
                projectMap.set(folder.uri.toString(), projects);
            }
        }
        if (_.isEmpty(pickItems)) {
            throw new Error("No java project found. Please make sure your Java project exists in the workspace.");
        }
        const disposables: Disposable[] = [];
        await new Promise((resolve, reject) => {
            const pickBox = createPickBox<IJavaProjectQuickPickItem>("Export Jar : Determine workspace", "Select the workspace", pickItems, false);
            disposables.push(
                pickBox.onDidAccept(() => {
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
        for (const d of disposables) {
            d.dispose();
        }
    }

}

interface IJavaProjectQuickPickItem extends QuickPickItem {
    workspaceFolder: WorkspaceFolder;
}
