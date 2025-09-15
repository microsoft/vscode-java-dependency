// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, type ExtensionContext, extensions, workspace, type WorkspaceFolder } from "vscode";

import { Jdtls } from "../java/jdtls";
import { languageServerApiManager } from "../languageServerApi/languageServerApiManager";
import { ExtensionName } from "../constants";
import { UpgradeIssue } from "./type";
import { instrumentOperation, instrumentOperationAsVsCodeCommand, sendInfo } from "vscode-extension-telemetry-wrapper";
import { Commands } from "../commands";
import notificationManager from "./display/notificationManager";
import { Settings } from "../settings";
import assessmentManager from "./assessmentManager";

const DEFAULT_UPGRADE_PROMPT = "Upgrade Java project dependency to latest version.";


function shouldCheckUpgrade() {
    return Settings.getEnableDependencyDiagnostics()
        && !!extensions.getExtension(ExtensionName.APP_MODERNIZATION_UPGRADE_FOR_JAVA);
}

async function runUpgrade(promptText: string) {
    await commands.executeCommand('workbench.action.chat.open');
    await commands.executeCommand('workbench.action.chat.newEditSession', {
        agentMode: true,
        inputValue: promptText,
    });
}

class UpgradeManager {
    public static initialize(context: ExtensionContext) {
        notificationManager.initialize(context);

        // Commands to be used
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.JAVA_UPGRADE_WITH_COPILOT, async (promptText?: string) => {
            const promptToUse = promptText ?? DEFAULT_UPGRADE_PROMPT;
            // The command should typically exist as we checked for the extension before.
            const hasAgentModeCommand = (await commands.getCommands(true).then(cmds => cmds.includes(Commands.GOTO_AGENT_MODE)));
            if (hasAgentModeCommand) {
                await commands.executeCommand(Commands.GOTO_AGENT_MODE, { prompt: promptToUse });
            } else {
                await runUpgrade(promptToUse);
            }
        }));
        commands.executeCommand('setContext', 'isModernizationExtensionInstalled',
            !!extensions.getExtension(ExtensionName.APP_MODERNIZATION_FOR_JAVA));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_MODERNIZE_JAVA_PROJECT, () => {
            commands.executeCommand("workbench.view.extension.azureJavaMigrationExplorer");
        }));

        UpgradeManager.scan();
    }

    public static scan() {
        if (!shouldCheckUpgrade()) {
            return;
        }
        workspace.workspaceFolders?.forEach((folder) =>
            UpgradeManager.checkUpgradableComponents(folder)
        );
    }

    private static async checkUpgradableComponents(folder: WorkspaceFolder) {
        return (instrumentOperation("upgradeManager.checkUpgradableComponents",
            async (operationId: string) => {
                if (!await languageServerApiManager.ready()) {
                    return;
                }
                const hasJavaError: boolean = await Jdtls.checkImportStatus();
                if (hasJavaError) {
                    return;
                }

                const projectIssues: UpgradeIssue[] = [];
                const uri = folder.uri.toString();
                const projects = await Jdtls.getProjects(uri);
                await Promise.allSettled(projects.map(async (projectNode) => {
                    const issues = await assessmentManager.getProjectIssues(projectNode);
                    projectIssues.push(...issues);
                    sendInfo(operationId, {
                        issuesFoundForPackageId: JSON.stringify(projectIssues.map(x => `${x.packageId}:${x.currentVersion}`)),
                    });
                }));

                if (projectIssues.length > 0) {
                    // only show one issue in notifications
                    notificationManager.render(projectIssues);
                }
            }
        ))()
    }
}

export default UpgradeManager;