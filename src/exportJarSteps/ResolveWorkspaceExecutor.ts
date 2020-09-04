// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import { Disposable, Uri, window, workspace } from "vscode";
import { ExportJarStep, IStepMetadata } from "../exportJarFileCommand";
import { Jdtls } from "../java/jdtls";
import { INodeData } from "../java/nodeData";
import { WorkspaceNode } from "../views/workspaceNode";
import { IExportJarStepExecutor } from "./IExportJarStepExecutor";
import { createPickBox, IJarQuickPickItem } from "./utility";

export class ResolveWorkspaceExecutor implements IExportJarStepExecutor {

    public async execute(stepMetadata: IStepMetadata): Promise<ExportJarStep> {
        await this.resolveWorkspaceFolder(stepMetadata, stepMetadata.entry);
        if (_.isEmpty(stepMetadata.projectList)) {
            throw new Error("No java project found. Please make sure your java project exists in the workspace.");
        }
        return ExportJarStep.ResolveMainMethod;
    }

    private async resolveWorkspaceFolder(stepMetadata: IStepMetadata, node?: INodeData) {
        if (node instanceof WorkspaceNode) {
            await this.assignProjectList(stepMetadata, node.uri);
            return;
        }
        const folders = workspace.workspaceFolders;
        // Guarded by workspaceFolderCount != 0 in package.json
        if (folders.length === 1) {
            await this.assignProjectList(stepMetadata, folders[0].uri.toString());
            return;
        }
        const pickItems: IJarQuickPickItem[] = [];
        const projectMap: Map<string, INodeData[]> = new Map<string, INodeData[]>();
        for (const folder of folders) {
            const uriString: string = folder.uri.toString();
            const projects: INodeData[] = await Jdtls.getProjects(Uri.parse(uriString).toString());
            if (!_.isEmpty(projects)) {
                pickItems.push({
                    label: folder.name,
                    description: folder.uri.fsPath,
                    uri: uriString,
                });
                projectMap.set(uriString, projects);
            }
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

    private async assignProjectList(stepMetadata: IStepMetadata, uri: string) {
        stepMetadata.workspaceUri = Uri.parse(uri);
        stepMetadata.projectList = await Jdtls.getProjects(stepMetadata.workspaceUri.toString());
    }
}
