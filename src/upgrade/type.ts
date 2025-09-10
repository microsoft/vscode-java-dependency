export type DependencyCheckItem = { name: string, supportedVersion: string };
export type DependencyCheckMetadata = Record<string, DependencyCheckItem>;
export type DependencyCheckResult = DependencyCheckItem & { packageRuleUsed: string };

export enum UpgradeReason {
    END_OF_LIFE,
    CVE,
    ENGINE_TOO_OLD,
};

export type UpgradeIssue = {
    packageId: string;
    packageDisplayName?: string;
    reason: UpgradeReason;
    currentVersion: string;
    suggestedVersion?: string;
};

export type FileIssues = Record</* packageId */string, UpgradeIssue>;