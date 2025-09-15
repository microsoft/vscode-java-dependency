// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as semver from 'semver';
import { Jdtls } from "../java/jdtls";
import { NodeKind, type INodeData } from "../java/nodeData";
import { type DependencyCheckItem, UpgradeReason, type UpgradeIssue } from "./type";
import { DEPENDENCY_JAVA_RUNTIME } from "./dependency.data";
import { Upgrade } from '../constants';
import { buildPackageId } from './utility';
import metadataManager from './metadataManager';
import { sendInfo } from 'vscode-extension-telemetry-wrapper';

function getJavaIssues(data: INodeData): UpgradeIssue[] {
    const javaVersion = data.metaData?.MaxSourceVersion as number | undefined;
    const { name, reason, supportedVersion, suggestedVersion } = DEPENDENCY_JAVA_RUNTIME;
    if (!javaVersion) {
        return [];
    }
    const currentSemVer = semver.coerce(javaVersion);
    if (currentSemVer && !semver.satisfies(currentSemVer, supportedVersion)) {
        return [{
            packageId: Upgrade.PACKAGE_ID_FOR_JAVA_RUNTIME,
            packageDisplayName: name,
            currentVersion: String(javaVersion),
            reason,
            suggestedVersion,
        }];
    }

    return [];
}

function getUpgrade(versionString: string, supportedVersionDefinition: DependencyCheckItem): Omit<UpgradeIssue, "packageId"> | null {
    const { reason } = supportedVersionDefinition;
    switch (reason) {
        case UpgradeReason.DEPRECATED: {
            const { alternative } = supportedVersionDefinition;
            return {
                packageDisplayName: supportedVersionDefinition.name,
                reason,
                currentVersion: versionString,
                suggestedVersion: alternative,
            }
        }
        case UpgradeReason.END_OF_LIFE: {
            const currentSemVer = semver.coerce(versionString);
            if (currentSemVer && !semver.satisfies(currentSemVer, supportedVersionDefinition.supportedVersion)) {
                return {
                    packageDisplayName: supportedVersionDefinition.name,
                    reason,
                    currentVersion: versionString,
                    suggestedVersion: supportedVersionDefinition.suggestedVersion,
                }
            }
        }

    }

    return null;
}

function checkDependencyIssue(data: INodeData): UpgradeIssue | null {
    const versionString = data.metaData?.["maven.version"];
    const groupId = data.metaData?.["maven.groupId"];
    const artifactId = data.metaData?.["maven.artifactId"];
    const packageId = buildPackageId(groupId, artifactId);
    const supportedVersionDefinition = metadataManager.getMetadataById(packageId);
    if (!versionString || !groupId || !supportedVersionDefinition) {
        return null;
    }

    const upgrade = getUpgrade(versionString, supportedVersionDefinition);
    if (upgrade) {
        return { ...upgrade, packageId };
    }
    return null;
}

async function getDependencyIssues(projectNode: INodeData): Promise<UpgradeIssue[]> {
    const projectStructureData = await Jdtls.getPackageData({ kind: NodeKind.Project, projectUri: projectNode.uri });
    const packageContainerIssues = await Promise.allSettled(
        projectStructureData
            .filter(x => x.kind === NodeKind.Container)
            .map(async (packageContainer) => {
                const packages = await Jdtls.getPackageData({
                    kind: NodeKind.Container,
                    projectUri: projectNode.uri,
                    path: packageContainer.path,
                });

                return packages.map(checkDependencyIssue).filter((x): x is UpgradeIssue => Boolean(x));
            })
    );

    return packageContainerIssues
        .map(x => {
            if (x.status === "fulfilled") {
                return x.value;
            }

            sendInfo("", {
                operationName: "java.dependency.assessmentManager.getDependencyIssues",
                failureReason: String(x.reason),
            });
            return [];
        })
        .reduce((a, b) => [...a, ...b]);
}

async function getProjectIssues(projectNode: INodeData): Promise<UpgradeIssue[]> {
    const issues: UpgradeIssue[] = [];
    issues.push(...getJavaIssues(projectNode));
    issues.push(...(await getDependencyIssues(projectNode)));
    return issues;
}

export default {
    getProjectIssues
};