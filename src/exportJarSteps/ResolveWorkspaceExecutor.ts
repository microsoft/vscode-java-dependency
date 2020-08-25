// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Disposable, Uri, workspace } from "vscode";
import { ExportJarStep, IStepMetadata } from "../exportJarFileCommand";
import { Jdtls } from "../java/jdtls";
import { INodeData } from "../java/nodeData";
import { WorkspaceNode } from "../views/workspaceNode";
import { IExportJarStepExecutor } from "./IExportJarStepExecutor";
import { createPickBox, IJarQuickPickItem } from "./utility";

export class ResolveWorkspaceExecutor implements IExportJarStepExecutor {

    public async execute(stepMetadata: IStepMetadata): Promise<ExportJarStep> {
        await this.resolveWorkspaceFolder(stepMetadata, stepMetadata.entry);
        stepMetadata.projectList = await Jdtls.getProjects(stepMetadata.workspaceUri.toString());
        if (stepMetadata.projectList === undefined) {
            throw new Error("No project found. Please make sure your project folder is opened.");
        }
        return ExportJarStep.ResolveMainMethod;
    }

    private async resolveWorkspaceFolder(stepMetadata: IStepMetadata, node?: INodeData): Promise<boolean> {
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
        const disposables: Disposable[] = [];
        let result: boolean = false;
        try {
            result = await new Promise<boolean>((resolve, reject) => {
                const pickBox = createPickBox("Export Jar : Determine project", "Select the project", pickItems, false);
                disposables.push(
                    pickBox.onDidAccept(() => {
                        stepMetadata.workspaceUri = Uri.parse(pickBox.selectedItems[0].uri);
                        return resolve(true);
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
        return result;
    }
}
