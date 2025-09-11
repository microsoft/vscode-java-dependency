// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, type ExtensionContext, extensions, workspace, type WorkspaceFolder } from "vscode";
import * as semver from 'semver'
import { Jdtls } from "../java/jdtls";
import { languageServerApiManager } from "../languageServerApi/languageServerApiManager";
import { NodeKind, type INodeData } from "../java/nodeData";
import { ExtensionName, Upgrade } from "../constants";
import { UpgradeIssue, UpgradeReason } from "./type";
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { Commands } from "../commands";
import metadataManager from "./metadataManager";
import { buildPackageId } from "./utility";
import notificationManager from "./display/notificationManager";
import { Settings } from "../settings";

const DEFAULT_UPGRADE_PROMPT = "Upgrade Java project dependency.";

function getJavaIssues(data: INodeData): UpgradeIssue[] {
    const javaVersion = data.metaData?.MaxSourceVersion as number | undefined;
    if (!javaVersion) {
        return [];
    }
    if (javaVersion < Upgrade.LATEST_JAVA_LTS_VESRION) {
        return [{
            packageId: buildPackageId(Upgrade.DIAGNOSTICS_GROUP_ID_FOR_JAVA_ENGINE, "*"),
            packageDisplayName: "Java Runtime",
            reason: UpgradeReason.ENGINE_TOO_OLD,
            currentVersion: String(javaVersion),
            suggestedVersion: String(Upgrade.LATEST_JAVA_LTS_VESRION),
        }];
    }

    return [];
}

function getDependencyIssues(data: INodeData): UpgradeIssue[] {
    const versionString = data.metaData?.["maven.version"];
    const groupId = data.metaData?.["maven.groupId"];
    const artifactId = data.metaData?.["maven.artifactId"];
    const packageId = buildPackageId(groupId, artifactId);
    const supportedVersionDefinition = metadataManager.getMetadataById(packageId);
    if (!versionString || !groupId || !supportedVersionDefinition) {
        return [];
    }
    const currentVersion = semver.coerce(versionString);
    if (!currentVersion) {
        return [];
    }
    if (!semver.satisfies(currentVersion, supportedVersionDefinition.supportedVersion)) {
        return [{
            packageId,
            packageDisplayName: supportedVersionDefinition.name,
            reason: UpgradeReason.END_OF_LIFE,
            currentVersion: versionString,
            suggestedVersion: "latest", // TODO
        }];
    }
    return [];
}

async function getProjectIssues(projectNode: INodeData): Promise<UpgradeIssue[]> {
    const pomPath = projectNode.metaData?.PomPath as string | undefined;
    if (!pomPath) {
        return [];
    }
    const issues: UpgradeIssue[] = [];
    issues.push(...getJavaIssues(projectNode));
    if (issues.length > 0) {
        // If Java runtime version issue is found, prompt for it only
        return issues;
    }
    const packageData = await Jdtls.getPackageData({ kind: NodeKind.Project, projectUri: projectNode.uri });
    await Promise.allSettled(
        packageData
            .filter(x => x.kind === NodeKind.Container)
            .map(async (packageContainer) => {
                const packages = await Jdtls.getPackageData({
                    kind: NodeKind.Container,
                    projectUri: projectNode.uri,
                    path: packageContainer.path,
                });
                packages.forEach(
                    (pkg) => {
                        issues.push(...getDependencyIssues(pkg))
                    }
                );
            })
    );
    return issues;
}

function shouldCheckUpgrade() {
    return Settings.getShowUpgradeReminder()
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
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_TRIGGER_JAVA_UPGRADE_TOOL, (promptText?: string) => {
            // The command should typically exist as we checked for the extension before.
            const hasAgentModeCommand = !!commands.getCommands(true).then(cmds => cmds.includes(Commands.GOTO_AGENT_MODE));
            if (hasAgentModeCommand) {
                commands.executeCommand(Commands.GOTO_AGENT_MODE, { prompt: promptText });
            } else {
                runUpgrade(promptText ?? DEFAULT_UPGRADE_PROMPT);
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
        if (!await languageServerApiManager.ready()) {
            return;
        }
        const hasJavaError: boolean = await Jdtls.checkImportStatus();
        if (hasJavaError) {
            return;
        }

        const projectIssues: Record</* pomPath */string, UpgradeIssue[]> = {};
        const uri = folder.uri.toString();
        const projects = await Jdtls.getProjects(uri);
        let hasIssues = false;
        await Promise.allSettled(projects.map(async (projectNode) => {
            const pomPath = projectNode.metaData?.PomPath as string | undefined ?? "Unknown POM path";

            const issues = await getProjectIssues(projectNode);
            if (issues.length > 0) {
                hasIssues = true;
                projectIssues[pomPath] = issues;
            }
        }));

        if (hasIssues) {
            // only show one issue in notifications
            notificationManager.triggerNotification(Object.values(projectIssues)[0][0]);
        }
    }
}

export default UpgradeManager;