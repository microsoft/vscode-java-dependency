import { UpgradeReason, type UpgradeIssue } from "./type";

export function buildMessage(issue: UpgradeIssue): string {
    const { packageId, packageDisplayName, currentVersion, reason } = issue;
    const name = packageDisplayName ?? packageId;

    switch (reason) {
        case UpgradeReason.END_OF_LIFE: {
            return `Your project dependency ${name} (${currentVersion}) is in end-of-life. Consider upgrading using GitHub Copilot for better security and performance.`;
        }
        case UpgradeReason.CVE: {
            return `Your project dependency ${name} (${currentVersion}) has CVE. Consider upgrading using GitHub Copilot for better security.`;
        }
        case UpgradeReason.ENGINE_TOO_OLD: {
            return `Your project Java version (${currentVersion}) is too old. Consider upgrading using GitHub Copilot for better performance and features.`;
        }
    }
}

export function buildFixPrompt(issue: UpgradeIssue): string {
    const { packageId, packageDisplayName, reason, suggestedVersion } = issue;
    const name = packageDisplayName ?? packageId;

    const suffix = [
        ...(suggestedVersion ? [`The target version is ${suggestedVersion}.`] : [])
    ];

    switch (reason) {
        case UpgradeReason.END_OF_LIFE: {
            return [`Upgrade the package ${name} using Java Upgrade Tool.`, ...suffix].join(" ");
        }
        case UpgradeReason.CVE: {
            return [`Upgrade the package ${name} to resolve CVE using Java Upgrade Tool.`, ...suffix].join(" ");
        }
        case UpgradeReason.ENGINE_TOO_OLD: {
            return [`Upgrade Java version using Java Upgrade Tool.`, ...suffix].join(" ");
        }
    }
}

export function buildPackageId(groupId: string, artifactId: string): string {
    return `${groupId}:${artifactId}`;
}