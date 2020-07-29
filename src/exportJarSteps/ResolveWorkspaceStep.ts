// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Uri, workspace } from "vscode";
import { GenerateSettings } from "../exportJarFileCommand";
import { Jdtls } from "../java/jdtls";
import { INodeData } from "../java/nodeData";
import { WorkspaceNode } from "../views/workspaceNode";
import { ExportSteps, IStep } from "./IStep";
import { createPickBox, IJarQuickPickItem } from "./utility";

export class ResolveWorkspaceStep implements IStep {

    public exportStep;

    constructor() {
        this.exportStep = ExportSteps.ResolveWorkspace;
    }

    public async execute(lastStep: IStep | undefined, generateSettings: GenerateSettings): Promise<ExportSteps> {
        await this.resolveWorkspaceFolder(lastStep, generateSettings, generateSettings.entry);
        generateSettings.projectList = await Jdtls.getProjects(generateSettings.workspaceUri.toString());
        if (generateSettings.projectList === undefined) {
            throw new Error("No project found. Please make sure your project folder is opened.");
        }
        return ExportSteps.ResolveMainMethod;
    }

    private async resolveWorkspaceFolder(lastStep: IStep | undefined, generateSettings: GenerateSettings,
                                         node?: INodeData): Promise<boolean> {
        if (node instanceof WorkspaceNode) {
            generateSettings.workspaceUri = Uri.parse(node.uri);
            return true;
        }
        const folders = workspace.workspaceFolders;
        // Guarded by workspaceFolderCount != 0 in package.json
        if (folders.length === 1) {
            generateSettings.workspaceUri = Uri.parse(folders[0].uri.toString());
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
        return new Promise<boolean>((resolve, reject) => {
            const pickBox = createPickBox("Export Jar : Determine project", "Select the project", pickItems, lastStep !== undefined);
            pickBox.onDidAccept(() => {
                generateSettings.workspaceUri = Uri.parse(pickBox.selectedItems[0].uri);
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
