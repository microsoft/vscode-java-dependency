// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import { Disposable, Uri, workspace } from "vscode";
import { ExportJarStep } from "../exportJarFileCommand";
import { Jdtls } from "../java/jdtls";
import { INodeData } from "../java/nodeData";
import { WorkspaceNode } from "../views/workspaceNode";
import { IExportJarStepExecutor } from "./IExportJarStepExecutor";
import { IStepMetadata } from "./IStepMetadata";
import { createPickBox, IJarQuickPickItem } from "./utility";

export class ResolveJavaProjectExecutor implements IExportJarStepExecutor {

    public getNextStep(): ExportJarStep {
        return ExportJarStep.ResolveMainMethod;
    }

    public async execute(stepMetadata: IStepMetadata): Promise<ExportJarStep> {
        await this.resolveJavaProject(stepMetadata, stepMetadata.entry);
        return this.getNextStep();
    }

    private async resolveJavaProject(stepMetadata: IStepMetadata, node?: INodeData): Promise<void> {
        if (node instanceof WorkspaceNode) {
            stepMetadata.workspaceUri = Uri.parse(node.uri);
            stepMetadata.projectList = await Jdtls.getProjects(node.uri);
            return;
        }
        const folders = workspace.workspaceFolders;
        // Guarded by workspaceFolderCount != 0 in package.json
        if (folders.length === 1) {
            stepMetadata.workspaceUri = folders[0].uri;
            stepMetadata.projectList = await Jdtls.getProjects(folders[0].uri.toString());
            return;
        }
        const pickItems: IJarQuickPickItem[] = [];
        const projectMap: Map<string, INodeData[]> = new Map<string, INodeData[]>();
        for (const folder of folders) {
            const projects: INodeData[] = await Jdtls.getProjects(folder.uri.toString());
            if (!_.isEmpty(projects)) {
                pickItems.push({
                    label: folder.name,
                    description: folder.uri.fsPath,
                    uri: folder.uri,
                });
                projectMap.set(folder.uri.toString(), projects);
            }
        }
        if (_.isEmpty(pickItems)) {
            throw new Error("No java project found. Please make sure your Java project exists in the workspace.");
        }
        const disposables: Disposable[] = [];
        await new Promise((resolve, reject) => {
            const pickBox = createPickBox("Export Jar : Determine project", "Select the project", pickItems, false);
            disposables.push(
                pickBox.onDidAccept(() => {
                    stepMetadata.workspaceUri = pickBox.selectedItems[0].uri;
                    stepMetadata.projectList = projectMap.get(pickBox.selectedItems[0].uri.toString());
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
