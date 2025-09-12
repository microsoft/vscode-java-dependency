// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, type ExtensionContext, extensions, workspace, type WorkspaceFolder } from "vscode";
import * as semver from 'semver'
import { Jdtls } from "../java/jdtls";
import { languageServerApiManager } from "../languageServerApi/languageServerApiManager";
import { NodeKind, type INodeData } from "../java/nodeData";
import { ExtensionName, Upgrade } from "../constants";
import { DependencyCheckItem, UpgradeIssue, UpgradeReason } from "./type";
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { Commands } from "../commands";
import metadataManager from "./metadataManager";
import { buildPackageId } from "./utility";
import notificationManager from "./display/notificationManager";
import { Settings } from "../settings";
import { DEPENDENCY_JAVA_RUNTIME } from "./dependency.data";

const DEFAULT_UPGRADE_PROMPT = "Upgrade Java project dependency to latest version.";

function getJavaIssues(data: INodeData): UpgradeIssue[] {
    const javaVersion = data.metaData?.MaxSourceVersion as number | undefined;
    const javaSupportedVersionDefinition = DEPENDENCY_JAVA_RUNTIME;
    if (!javaVersion) {
        return [];
    }
    if (javaVersion < Upgrade.LATEST_JAVA_LTS_VESRION) {
        return [{
            packageId: Upgrade.PACKAGE_ID_FOR_JAVA_RUNTIME,
            packageDisplayName: javaSupportedVersionDefinition.name,
            reason: javaSupportedVersionDefinition.reason,
            currentVersion: String(javaVersion),
            suggestedVersion: String(Upgrade.LATEST_JAVA_LTS_VESRION),
        }];
    }

    return [];
}

function getUpgrade(versionString: string, supportedVersionDefinition: DependencyCheckItem): Omit<UpgradeIssue, "packageId"> | null {
    const { reason } = supportedVersionDefinition;
    switch (reason) {
        case UpgradeReason.DEPRECATED: {
            const { alternative } = supportedVersionDefinition;
            return {
                packageDisplayName: supportedVersionDefinition.name,
                reason,
                currentVersion: versionString,
                suggestedVersion: alternative,
            }
        }
        case UpgradeReason.END_OF_LIFE: {
            const currentSemVer = semver.coerce(versionString);
            if (currentSemVer && !semver.satisfies(currentSemVer, supportedVersionDefinition.supportedVersion)) {
                return {
                    packageDisplayName: supportedVersionDefinition.name,
                    reason,
                    currentVersion: versionString,
                }
            }
        }

    }

    return null;
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

    const upgrade = getUpgrade(versionString, supportedVersionDefinition);
    if (upgrade) {
        return [{ ...upgrade, packageId }];
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
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_TRIGGER_JAVA_UPGRADE_TOOL, async (promptText?: string) => {
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