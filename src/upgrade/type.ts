// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

export type UpgradeTarget = { name: string; description: string };
export type DependencyCheckItemBase = { name: string, reason: UpgradeReason, suggestedVersion: UpgradeTarget };
export type DependencyCheckItemEol = DependencyCheckItemBase & {
    reason: UpgradeReason.END_OF_LIFE,
    supportedVersion: string,
    eolDate: Record<string, string>
};
export type DependencyCheckItemJreTooOld = DependencyCheckItemBase & { reason: UpgradeReason.JRE_TOO_OLD };
export type DependencyCheckItemDeprecated = DependencyCheckItemBase & { reason: UpgradeReason.DEPRECATED };
export type DependencyCheckItem = (DependencyCheckItemEol | DependencyCheckItemJreTooOld | DependencyCheckItemDeprecated);
export type DependencyCheckMetadata = Record<string, DependencyCheckItem>;

export enum UpgradeReason {
    END_OF_LIFE,
    DEPRECATED,
    CVE,
    JRE_TOO_OLD,
}

export type UpgradeIssue = {
    packageId: string;
    packageDisplayName: string;
    currentVersion: string;
} & DependencyCheckItem;

export interface IUpgradeIssuesRenderer {
    render(issues: UpgradeIssue[]): void;
}

export type VersionSet = Record<string, Set<string>>;