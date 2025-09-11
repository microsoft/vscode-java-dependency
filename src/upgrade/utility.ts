// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Uri } from "vscode";
import { UpgradeReason, type UpgradeIssue } from "./type";
import { Upgrade } from "../constants";

export function buildNotificationMessage(issue: UpgradeIssue): string {
    const { packageId, currentVersion, suggestedVersion, packageDisplayName } = issue;
    const name = packageDisplayName ?? packageId;

    if (packageId === buildPackageId(Upgrade.DIAGNOSTICS_GROUP_ID_FOR_JAVA_RUNTIME, "*")) {
        return `The current project is using an older runtime (Java ${currentVersion}). Do you want to upgrade to the latest LTS version${suggestedVersion ? ` (${suggestedVersion})` : ""}?`
    }

    return `The current project is using ${name} ${currentVersion}, which reached end of life. Do you want to upgrade to ${suggestedVersion ? ` ${suggestedVersion}` : "the latest version"
        }?`
}

export function buildFixPrompt(issue: UpgradeIssue): string {
    const { packageId, packageDisplayName, reason, suggestedVersion } = issue;
    const name = packageDisplayName ?? packageId;

    switch (reason) {
        case UpgradeReason.CVE: {
            return `upgrade package ${name} to ${suggestedVersion ?? "the latest version"} to address CVE issues using java upgrade tools`;
        }
        case UpgradeReason.JRE_TOO_OLD: {
            return `upgrade java runtime to latest LTS version${suggestedVersion ? ` (${suggestedVersion})` : ""
                } using java upgrade tools`;
        }
        default: {
            return `upgrade package ${name} to ${suggestedVersion ?? "the latest version"} using java upgrade tools`;
        }
    }
}

export function buildPackageId(groupId: string, artifactId: string): string {
    return `${groupId}:${artifactId}`;
}

export function normalizePath(path: string): string {
    return Uri.parse(path).toString();
}