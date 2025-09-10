import { Uri } from "vscode";
import { UpgradeReason, type UpgradeIssue } from "./type";

export function buildFixPrompt(issue: UpgradeIssue): string {
    const { packageId, packageDisplayName, reason, suggestedVersion } = issue;
    const name = packageDisplayName ?? packageId;

    const suffix = [
        ...(suggestedVersion ? [`The target version is ${suggestedVersion}.`] : [])
    ];

    switch (reason) {
        case UpgradeReason.END_OF_LIFE: {
            return [`Upgrade the package ${name}.`, ...suffix].join(" ");
        }
        case UpgradeReason.CVE: {
            return [`Upgrade the package ${name} to address CVE issues.`, ...suffix].join(" ");
        }
        case UpgradeReason.ENGINE_TOO_OLD: {
            return [`Upgrade the version of Java.`, ...suffix].join(" ");
        }
    }
}

export function buildPackageId(groupId: string, artifactId: string): string {
    return `${groupId}:${artifactId}`;
}

export function normalizePath(path: string): string {
    return Uri.parse(path).toString();
}