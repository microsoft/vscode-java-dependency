// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Uri } from "vscode";
import { UpgradeReason, type UpgradeIssue } from "./type";
import { Upgrade } from "../constants";

export function buildFixPrompt(issue: UpgradeIssue): string {
    const { packageId, packageDisplayName, reason, suggestedVersion } = issue;
    const name = packageDisplayName ?? packageId;

    switch (reason) {
        case UpgradeReason.END_OF_LIFE: {
            return `upgrade package ${name} to ${suggestedVersion ?? "latest version"} using java upgrade tools`;
        }
        case UpgradeReason.CVE: {
            return `upgrade package ${name} to ${suggestedVersion ?? "latest version"} to address CVE issues using java upgrade tools`;
        }
        case UpgradeReason.ENGINE_TOO_OLD: {
            return `upgrade java runtime to latest LTS (${Upgrade.LATEST_JAVA_LTS_VESRION}) using java upgrade tools`;
        }
    }
}

export function buildPackageId(groupId: string, artifactId: string): string {
    return `${groupId}:${artifactId}`;
}

export function normalizePath(path: string): string {
    return Uri.parse(path).toString();
}