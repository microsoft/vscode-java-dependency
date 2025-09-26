// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, extensions, Uri, window } from "vscode";
import * as semver from "semver";
import { UpgradeReason, type UpgradeIssue } from "./type";
import { ExtensionName, Upgrade } from "../constants";
import { instrumentOperation } from "vscode-extension-telemetry-wrapper";


function findEolDate(currentVersion: string, eolDate: Record<string, string>): string | null {
    const currentVersionSemVer = semver.coerce(currentVersion);
    if (!currentVersionSemVer) {
        return null;
    }
    for (const [versionRange, date] of Object.entries(eolDate)) {
        if (semver.satisfies(currentVersionSemVer, versionRange)) {
            return date;
        }
    }
    return null;
}

export function buildNotificationMessage(issue: UpgradeIssue, hasExtension: boolean): string {
    const {
        packageId,
        currentVersion,
        reason,
        suggestedVersion: { name: suggestedVersionName, description: suggestedVersionDescription },
        packageDisplayName
    } = issue;

    const upgradeWord = hasExtension ? "upgrade" : `install ${ExtensionName.APP_MODERNIZATION_EXTENSION_NAME} extension and upgrade`;

    if (packageId === Upgrade.PACKAGE_ID_FOR_JAVA_RUNTIME) {
        return `This project is using an older Java runtime (${currentVersion}). Would you like to ${upgradeWord} it to ${suggestedVersionName} (latest LTS)?`;
    }

    switch (reason) {
        case UpgradeReason.END_OF_LIFE: {
            const { eolDate } = issue;
            const versionEolDate = findEolDate(currentVersion, eolDate);
            return `This project is using ${packageDisplayName} ${currentVersion}, which has reached end of life${versionEolDate ? ` in ${versionEolDate}` : ""
                }. Would you like to ${upgradeWord} it to ${suggestedVersionName} (${suggestedVersionDescription})?`;
        }
        case UpgradeReason.DEPRECATED:
        default: {
            return `This project is using ${packageDisplayName} ${currentVersion}, which has been deprecated. Would you like to ${upgradeWord} it to ${suggestedVersionName} (${suggestedVersionDescription})?`;
        }
    }
}


export function buildFixPrompt(issue: UpgradeIssue): string {
    const { packageDisplayName, reason } = issue;

    switch (reason) {
        case UpgradeReason.JRE_TOO_OLD: {
            const { suggestedVersion: { name: suggestedVersionName } } = issue;
            return `upgrade java runtime to the latest LTS version ${suggestedVersionName} using java upgrade tools`;
        }
        case UpgradeReason.END_OF_LIFE:
        case UpgradeReason.DEPRECATED: {
            const { suggestedVersion: { name: suggestedVersionName } } = issue;
            return `upgrade ${packageDisplayName} to ${suggestedVersionName} using java upgrade tools`;
        }
    }
}

export function buildPackageId(groupId: string, artifactId: string): string {
    return `${groupId}:${artifactId}`;
}

export function normalizePath(path: string): string {
    return Uri.parse(path).toString();
}

async function checkOrPromptToEnableAppModExtension(keyword: string) {
    if (extensions.getExtension(ExtensionName.APP_MODERNIZATION_FOR_JAVA)) {
        return;
    }

    // The extension is in a disabled state since we cannot detect the extension after installing it.
    await instrumentOperation("java.dependency.extensionDisabled", async () => {
        await commands.executeCommand("workbench.extensions.search", ExtensionName.APP_MODERNIZATION_FOR_JAVA);
        const BTN_TEXT = "Show extension in sidebar";
        const choice2 = await window.showInformationMessage(
            `${ExtensionName.APP_MODERNIZATION_EXTENSION_NAME} extension is required to ${keyword} Java projects but it seems disabled. Please enable it manually and try again.`,
            { modal: true },
            BTN_TEXT
        );
        if (choice2 === BTN_TEXT) {
            await commands.executeCommand("workbench.extensions.search", ExtensionName.APP_MODERNIZATION_FOR_JAVA);
        }
    })()
}

export async function checkOrPopupToInstallAppModExtensionForModernization(
    extensionIdToCheck: string,
    notificationText: string,
    buttonText: string): Promise<void> {
    if (extensions.getExtension(extensionIdToCheck)) {
        return;
    }

    const choice = await window.showInformationMessage(notificationText, { modal: true }, buttonText);
    if (choice === buttonText) {
        await commands.executeCommand("workbench.extensions.installExtension", ExtensionName.APP_MODERNIZATION_FOR_JAVA);
    } else {
        return;
    }

    await checkOrPromptToEnableAppModExtension("modernize");
}

export async function checkOrInstallAppModExtensionForUpgrade(
    extensionIdToCheck: string): Promise<void> {
    if (extensions.getExtension(extensionIdToCheck)) {
        return;
    }

    await commands.executeCommand("workbench.extensions.installExtension", ExtensionName.APP_MODERNIZATION_FOR_JAVA);
    await checkOrPromptToEnableAppModExtension("upgrade");
}