// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import { Disposable, Uri, workspace } from "vscode";
import { ExportJarStep, IStepMetadata } from "../exportJarFileCommand";
import { Jdtls } from "../java/jdtls";
import { INodeData } from "../java/nodeData";
import { WorkspaceNode } from "../views/workspaceNode";
import { IExportJarStepExecutor } from "./IExportJarStepExecutor";
import { createPickBox, IJarQuickPickItem } from "./utility";

export class ResolveJavaProjectExecutor implements IExportJarStepExecutor {

    public async execute(stepMetadata: IStepMetadata): Promise<ExportJarStep> {
        await this.resolveJavaProject(stepMetadata, stepMetadata.entry);
        return ExportJarStep.ResolveMainMethod;
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
            const uriString: string = folder.uri.toString();
            const projects: INodeData[] = await Jdtls.getProjects(uriString);
            if (!_.isEmpty(projects)) {
                pickItems.push({
                    label: folder.name,
                    description: folder.uri.fsPath,
                    uri: uriString,
                });
                projectMap.set(uriString, projects);
            }
        }
        if (_.isEmpty(pickItems)) {
            throw new Error("No java project found. Please make sure your Java project exists in the workspace.");
        }
        stepMetadata.isPickedWorkspace = true;
        const disposables: Disposable[] = [];
        await new Promise((resolve, reject) => {
            const pickBox = createPickBox("Export Jar : Determine project", "Select the project", pickItems, false);
            disposables.push(
                pickBox.onDidAccept(() => {
                    stepMetadata.workspaceUri = Uri.parse(pickBox.selectedItems[0].uri);
                    stepMetadata.projectList = projectMap.get(pickBox.selectedItems[0].uri);
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
