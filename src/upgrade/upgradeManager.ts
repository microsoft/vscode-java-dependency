// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, type ExtensionContext, workspace, type WorkspaceFolder } from "vscode";

import { Jdtls } from "../java/jdtls";
import { languageServerApiManager } from "../languageServerApi/languageServerApiManager";
import { ExtensionName } from "../constants";
import { instrumentOperation, instrumentOperationAsVsCodeCommand, sendInfo } from "vscode-extension-telemetry-wrapper";
import { Commands } from "../commands";
import notificationManager from "./display/notificationManager";
import { Settings } from "../settings";
import assessmentManager, { getDirectDependencies } from "./assessmentManager";
import { checkOrInstallAppModExtensionForUpgrade, checkOrPopupToInstallAppModExtensionForModernization } from "./utility";

const DEFAULT_UPGRADE_PROMPT = "Upgrade Java project dependency to latest version.";


function shouldRunCheckup() {
    return Settings.getEnableDependencyCheckup();
}

class UpgradeManager {
    public static initialize(context: ExtensionContext) {
        notificationManager.initialize(context);

        // Upgrade project
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.JAVA_UPGRADE_WITH_COPILOT, async (promptText?: string) => {
            await checkOrInstallAppModExtensionForUpgrade(ExtensionName.APP_MODERNIZATION_UPGRADE_FOR_JAVA);
            const promptToUse = promptText ?? DEFAULT_UPGRADE_PROMPT;
            await commands.executeCommand(Commands.GOTO_AGENT_MODE, { prompt: promptToUse });
        }));

        // Show modernization view
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_MODERNIZE_JAVA_PROJECT, async () => {
            await checkOrPopupToInstallAppModExtensionForModernization(
                ExtensionName.APP_MODERNIZATION_FOR_JAVA,
                `${ExtensionName.APP_MODERNIZATION_EXTENSION_NAME} extension is required to modernize Java projects. Would you like to install it and modernize this project?`,
                "Install Extension and Modernize");
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
        return instrumentOperation("java.dependency.runDependencyCheckup", async (_operationId: string) => {
            if (!(await languageServerApiManager.ready())) {
                sendInfo(_operationId, { skipReason: "languageServerNotReady" });
                return;
            }

            const hasJavaError: boolean = await Jdtls.checkImportStatus();
            if (hasJavaError) {
                sendInfo(_operationId, { skipReason: "hasJavaError" });
                return;
            }

            const projects = await Jdtls.getProjects(folder.uri.toString());
            const projectDirectDepsResults = await Promise.allSettled(
                projects.map(async (projectNode) => ({
                    projectNode,
                    dependencies: await getDirectDependencies(projectNode),
                }))
            );

            const allProjectDirectDeps = projectDirectDepsResults
                .filter((result): result is PromiseFulfilledResult<{ projectNode: typeof projects[0]; dependencies: Awaited<ReturnType<typeof getDirectDependencies>> }> =>
                    result.status === "fulfilled"
                )
                .map((result) => result.value);

            if (allProjectDirectDeps.every((x) => x.dependencies.length === 0)) {
                sendInfo(_operationId, { skipReason: "notMavenGradleProject" });
                return;
            }

            const workspaceIssues = await assessmentManager.getWorkspaceIssues(allProjectDirectDeps);
            if (workspaceIssues.length > 0) {
                notificationManager.render(workspaceIssues);
            }
        })();
    }
}

export default UpgradeManager;