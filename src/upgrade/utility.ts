// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Uri } from "vscode";
import { UpgradeReason, type UpgradeIssue } from "./type";
import { Upgrade } from "../constants";

export function buildNotificationMessage(issue: UpgradeIssue): string {
    const {
        packageId,
        currentVersion,
        reason,
        suggestedVersion: { name: suggestedVersionName, description: suggestedVersionDescription },
        packageDisplayName
    } = issue;


    if (packageId === Upgrade.PACKAGE_ID_FOR_JAVA_RUNTIME) {
        return `The current project is using an older Java runtime (${currentVersion}). Do you want to upgrade to the latest LTS version ${suggestedVersionName}?`;
    }

    switch (reason) {
        case UpgradeReason.CVE: {
            return `The current project is using ${packageDisplayName} ${currentVersion}, which has CVE issues. Do you want to upgrade to ${suggestedVersionName} (${suggestedVersionDescription})?`;
        }
        case UpgradeReason.DEPRECATED:
        case UpgradeReason.END_OF_LIFE:
        default: {
            return `The current project is using ${packageDisplayName} ${currentVersion}, which has reached end of life. Do you want to upgrade to ${suggestedVersionName} (${suggestedVersionDescription})?`;
        }
    }
}


export function buildFixPrompt(issue: UpgradeIssue): string {
    const { packageDisplayName, reason, suggestedVersion: { name: suggestedVersionName } } = issue;

    switch (reason) {
        case UpgradeReason.CVE: {
            return `upgrade ${packageDisplayName} to ${suggestedVersionName} to address CVE issues using java upgrade tools`;
        }
        case UpgradeReason.JRE_TOO_OLD: {
            return `upgrade java runtime to the latest LTS version ${suggestedVersionName} using java upgrade tools`;
        }
        default: {
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