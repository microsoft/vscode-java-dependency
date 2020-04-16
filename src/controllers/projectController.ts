// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from "fs-extra";
import * as _ from "lodash";
import * as path from "path";
import { commands, Disposable, ExtensionContext, QuickPickItem, Uri, window, workspace } from "vscode";
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { Commands } from "../commands";
import { Context } from "../constants";
import { contextManager } from "../contextManager";
import { Utility } from "../utility";

export class ProjectController implements Disposable {

    private disposable: Disposable;

    public constructor(public readonly context: ExtensionContext) {
        this.disposable = Disposable.from(
            instrumentOperationAsVsCodeCommand(Commands.JAVA_PROJECT_CREATE, () => this.createJavaProject()),
        );
    }

    public dispose() {
        this.disposable.dispose();
    }

    public async createJavaProject() {
        const projectKinds: QuickPickItem[] = [{
            label: BuildTool.None,
            detail: "A project without any build tools",
        }];
        if (contextManager.getContextValue(Context.MAVEN_ENABLED)) {
            projectKinds.push({
                label: BuildTool.Maven,
                detail: "Use Maven as the build tool of your Java project",
            });
        }
        const choice: QuickPickItem | undefined = projectKinds.length === 1 ? projectKinds[0] :
            await window.showQuickPick(projectKinds, {
                ignoreFocusOut: true,
                placeHolder: "Select the project build tool",
            },
        );

        switch (choice.label) {
            case BuildTool.Maven:
                await commands.executeCommand(Commands.JAVA_MAVEN_CREATE_PROJECT);
                break;
            case BuildTool.None:
                await this.scaffoldSimpleProject();
                break;
            default:
                break;
        }
    }

    private async scaffoldSimpleProject(): Promise<void> {
        const workspaceFolder = Utility.getDefaultWorkspaceFolder();
        const location: Uri[] = await window.showOpenDialog({
            defaultUri: workspaceFolder && workspaceFolder.uri,
            canSelectFiles: false,
            canSelectFolders: true,
            openLabel: "Select the location",
        });
        if (!location || !location.length) {
            return;
        }

        const basePath: string = location[0].fsPath;
        const projectName: string = await window.showInputBox({
            prompt: "Input a java project name",
            ignoreFocusOut: true,
            validateInput: async (name: string): Promise<string> => {
                if (name && !name.match(/^[^*~/\\]+$/)) {
                    return "Please input a valid project name";
                }
                if (name && await fse.pathExists(path.join(basePath, name))) {
                    return "A project with this name already exists.";
                }
                return "";
            },
        });
        const projectRoot: string = path.join(basePath, projectName);
        const templateRoot: string = path.join(this.context.extensionPath, "templates", "invisible-project");
        try {
            await fse.ensureDir(projectRoot);
            await fse.copy(templateRoot, projectRoot);
        } catch (error) {
            window.showErrorMessage(error.message);
            return;
        }
        const openInNewWindow = workspace && !_.isEmpty(workspace.workspaceFolders);
        await commands.executeCommand(Commands.VSCODE_OPEN_FOLDER, Uri.file(path.join(basePath, projectName)), openInNewWindow);
    }
}

enum BuildTool {
    Maven = "Maven",
    None = "No build tools",
}
