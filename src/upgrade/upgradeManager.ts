// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, type ExtensionContext, workspace, type WorkspaceFolder } from "vscode";

import { Jdtls } from "../java/jdtls";
import { languageServerApiManager } from "../languageServerApi/languageServerApiManager";
import { ExtensionName } from "../constants";
import { instrumentOperation, instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { Commands } from "../commands";
import notificationManager from "./display/notificationManager";
import { Settings } from "../settings";
import assessmentManager from "./assessmentManager";
import { checkOrInstallExtension } from "./utility";

const DEFAULT_UPGRADE_PROMPT = "Upgrade Java project dependency to latest version.";


function shouldRunCheckup() {
    return Settings.getEnableDependencyCheckup();
}

class UpgradeManager {
    public static initialize(context: ExtensionContext) {
        notificationManager.initialize(context);

        // Commands to be used
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.JAVA_UPGRADE_WITH_COPILOT, async (promptText?: string) => {
            await checkOrInstallExtension(ExtensionName.APP_MODERNIZATION_UPGRADE_FOR_JAVA, ExtensionName.APP_MODERNIZATION_FOR_JAVA);
            const promptToUse = promptText ?? DEFAULT_UPGRADE_PROMPT;
            await commands.executeCommand(Commands.GOTO_AGENT_MODE, { prompt: promptToUse });
        }));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_MODERNIZE_JAVA_PROJECT, async () => {
            await checkOrInstallExtension(ExtensionName.APP_MODERNIZATION_FOR_JAVA);
            await commands.executeCommand("workbench.view.extension.azureJavaMigrationExplorer");
        }));

        UpgradeManager.scan();
    }

    public static scan() {
        if (!shouldRunCheckup()) {
            return;
        }
        workspace.workspaceFolders?.forEach((folder) =>
            UpgradeManager.runDependencyCheckup(folder)
        );
    }

    private static async runDependencyCheckup(folder: WorkspaceFolder) {
        return (instrumentOperation("java.dependency.runDependencyCheckup",
            async (_operationId: string) => {
                if (!await languageServerApiManager.ready()) {
                    return;
                }
                const hasJavaError: boolean = await Jdtls.checkImportStatus();
                if (hasJavaError) {
                    return;
                }

                const uri = folder.uri.toString();
                const workspaceIssues = await assessmentManager.getWorkspaceIssues(uri);

                if (workspaceIssues.length > 0) {
                    // only show one issue in notifications
                    notificationManager.render(workspaceIssues);
                }
            }
        ))();
    }
}

export default UpgradeManager;