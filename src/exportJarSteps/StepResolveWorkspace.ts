// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Uri, workspace } from "vscode";
import { StepMetadata, steps } from "../exportJarFileCommand";
import { Jdtls } from "../java/jdtls";
import { INodeData } from "../java/nodeData";
import { WorkspaceNode } from "../views/workspaceNode";
import { IStep } from "./IStep";
import { createPickBox, IJarQuickPickItem } from "./utility";

export class StepResolveWorkspace implements IStep {

    public async execute(stepMetadata: StepMetadata): Promise<IStep> {
        await this.resolveWorkspaceFolder(stepMetadata, stepMetadata.entry);
        stepMetadata.projectList = await Jdtls.getProjects(stepMetadata.workspaceUri.toString());
        if (stepMetadata.projectList === undefined) {
            throw new Error("No project found. Please make sure your project folder is opened.");
        }
        steps.currentStep += 1;
        return steps.stepsList[steps.currentStep];
    }

    private async resolveWorkspaceFolder(stepMetadata: StepMetadata, node?: INodeData): Promise<boolean> {
        if (node instanceof WorkspaceNode) {
            stepMetadata.workspaceUri = Uri.parse(node.uri);
            return true;
        }
        const folders = workspace.workspaceFolders;
        // Guarded by workspaceFolderCount != 0 in package.json
        if (folders.length === 1) {
            stepMetadata.workspaceUri = Uri.parse(folders[0].uri.toString());
            return true;
        }
        const pickItems: IJarQuickPickItem[] = [];
        for (const folder of folders) {
            pickItems.push({
                label: folder.name,
                description: folder.uri.fsPath,
                uri: folder.uri.toString(),
            });
        }
        stepMetadata.isPickedWorkspace = true;
        return new Promise<boolean>((resolve, reject) => {
            const pickBox = createPickBox("Export Jar : Determine project", "Select the project", pickItems, false);
            pickBox.onDidAccept(() => {
                stepMetadata.workspaceUri = Uri.parse(pickBox.selectedItems[0].uri);
                resolve(true);
                pickBox.dispose();
            });
            pickBox.onDidHide(() => {
                reject();
                pickBox.dispose();
            });
            pickBox.show();
        });
    }
}
