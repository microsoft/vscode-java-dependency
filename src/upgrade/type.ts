// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

export type DependencyCheckItemBase = { name: string, reason: UpgradeReason };
export type DependencyCheckItemEol = DependencyCheckItemBase & { reason: UpgradeReason.END_OF_LIFE | UpgradeReason.JRE_TOO_OLD, supportedVersion: string, suggestedVersion: string };
export type DependencyCheckItemDeprecated = DependencyCheckItemBase & { reason: UpgradeReason.DEPRECATED, alternative: string };
export type DependencyCheckItem = (DependencyCheckItemEol | DependencyCheckItemDeprecated);
export type DependencyCheckMetadata = Record<string, DependencyCheckItem>;

export enum UpgradeReason {
    END_OF_LIFE,
    DEPRECATED,
    CVE,
    JRE_TOO_OLD,
};

export type UpgradeIssue = {
    packageId: string;
    packageDisplayName?: string;
    reason: UpgradeReason;
    currentVersion: string;
    suggestedVersion?: string;
};

export interface IUpgradeIssuesRenderer {
    render(issues: UpgradeIssue[]): void;
}