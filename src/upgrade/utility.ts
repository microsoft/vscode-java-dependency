// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Uri } from "vscode";
import * as semver from "semver";
import { UpgradeReason, type UpgradeIssue } from "./type";
import { Upgrade } from "../constants";


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
        case UpgradeReason.END_OF_LIFE: {
            const { eolDate } = issue;
            const versionEolDate = findEolDate(currentVersion, eolDate);
            return `The current project is using ${packageDisplayName} ${currentVersion}, which has reached end of life${versionEolDate ? ` in ${versionEolDate}` : ""
                }. Do you want to upgrade to ${suggestedVersionName} (${suggestedVersionDescription})?`;
        }
        case UpgradeReason.DEPRECATED:
        default: {
            return `The current project is using ${packageDisplayName} ${currentVersion}, which has been deprecated. Do you want to upgrade to ${suggestedVersionName} (${suggestedVersionDescription})?`;
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

