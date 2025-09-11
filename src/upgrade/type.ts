// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

export type DependencyCheckItem = { name: string, supportedVersion: string };
export type DependencyCheckMetadata = Record<string, DependencyCheckItem>;

export enum UpgradeReason {
    END_OF_LIFE,
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