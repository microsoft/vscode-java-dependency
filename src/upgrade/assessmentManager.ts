// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as semver from 'semver';
import { Jdtls } from "../java/jdtls";
import { NodeKind, type INodeData } from "../java/nodeData";
import { type DependencyCheckItem, type UpgradeIssue, type PackageDescription, UpgradeReason } from "./type";
import { DEPENDENCY_JAVA_RUNTIME } from "./dependency.metadata";
import { Upgrade } from '../constants';
import { buildPackageId } from './utility';
import metadataManager from './metadataManager';
import { sendInfo } from 'vscode-extension-telemetry-wrapper';

function packageNodeToDescription(node: INodeData): PackageDescription | null {
    const version = node.metaData?.["maven.version"];
    const groupId = node.metaData?.["maven.groupId"];
    const artifactId = node.metaData?.["maven.artifactId"];
    if (!version || !groupId || !artifactId) {
        return null;
    }

    return { version, groupId, artifactId };
}

function getVersionRange(versions: Set<string>) : string {
    const versionList = [...versions].sort((a, b) => semver.compare(a, b));
    if (versionList.length === 1) {
        return versionList[0];
    }
    return `${versionList[0]}|${versionList[versionList.length - 1]}`;
}

function collectVersionRange(pkgs: PackageDescription[]): Record<string, string> {
    const versionMap: Record<string, Set<string>> = {};
    for (const pkg of pkgs) {
        const groupId = pkg.groupId;
        if (!versionMap[groupId]) {
            versionMap[groupId] = new Set();
        }
        versionMap[groupId].add(pkg.version);
    }

    return Object.fromEntries(Object.entries(versionMap).map(([groupId, versions]) => [groupId, getVersionRange(versions)]));
}

function getJavaIssues(data: INodeData): UpgradeIssue[] {
    const javaVersion = data.metaData?.MaxSourceVersion as number | undefined;
    const { name, supportedVersion } = DEPENDENCY_JAVA_RUNTIME;
    if (!javaVersion) {
        return [];
    }
    const currentSemVer = semver.coerce(javaVersion);
    if (currentSemVer && !semver.satisfies(currentSemVer, supportedVersion)) {
        return [{
            ...DEPENDENCY_JAVA_RUNTIME,
            packageId: Upgrade.PACKAGE_ID_FOR_JAVA_RUNTIME,
            packageDisplayName: name,
            currentVersion: String(javaVersion),
        }];
    }

    return [];
}

function getUpgradeForDependency(versionString: string, supportedVersionDefinition: DependencyCheckItem, packageId: string): UpgradeIssue | null {
    const reason = supportedVersionDefinition.reason;
    switch (reason) {
        case UpgradeReason.DEPRECATED: {
            return {
                ...supportedVersionDefinition,
                packageDisplayName: supportedVersionDefinition.name,
                reason,
                currentVersion: versionString,
                packageId,
            };
        }
        case UpgradeReason.END_OF_LIFE: {
            const currentSemVer = semver.coerce(versionString);
            if (currentSemVer && !semver.satisfies(currentSemVer, supportedVersionDefinition.supportedVersion)) {
                return {
                    ...supportedVersionDefinition,
                    packageDisplayName: supportedVersionDefinition.name,
                    reason,
                    currentVersion: versionString,
                    packageId,
                };
            }
        }
    }

    return null;
}

function getPackageUpgradeMetadata(pkg: PackageDescription): DependencyCheckItem | null {
    const { groupId, artifactId } = pkg;
    const packageId = buildPackageId(groupId, artifactId);
    return metadataManager.getMetadataById(packageId) ?? null;
}

function getDependencyIssue(pkg: PackageDescription): UpgradeIssue | null {
    const supportedVersionDefinition = getPackageUpgradeMetadata(pkg);
    const version = pkg.version;
    if (!version || !supportedVersionDefinition) {
        return null;
    }
    const { groupId, artifactId } = pkg;
    const packageId = buildPackageId(groupId, artifactId);
    return getUpgradeForDependency(version, supportedVersionDefinition, packageId);
}

async function getDependencyIssues(projectNode: INodeData): Promise<UpgradeIssue[]> {
    const projectStructureData = await Jdtls.getPackageData({ kind: NodeKind.Project, projectUri: projectNode.uri });
    const packageContainerIssues = await Promise.allSettled(
        projectStructureData
            .filter(x => x.kind === NodeKind.Container)
            .map(async (packageContainer) => {
                const packageNodes = await Jdtls.getPackageData({
                    kind: NodeKind.Container,
                    projectUri: projectNode.uri,
                    path: packageContainer.path,
                });
                const packages = packageNodes.map(packageNodeToDescription).filter((x): x is PackageDescription => Boolean(x));

                const issues = packages.map(getDependencyIssue).filter((x): x is UpgradeIssue => Boolean(x));
                const versionRangeByGroupId = collectVersionRange(packages.filter(getPackageUpgradeMetadata));
                if (Object.keys(versionRangeByGroupId).length > 0) {
                    sendInfo("", {
                        operationName: "java.dependency.assessmentManager.getDependencyIssues",
                        versionRangeByGroupId: JSON.stringify(versionRangeByGroupId),
                    });
                }

                return issues;
            })
    );

    return packageContainerIssues
        .map(x => {
            if (x.status === "fulfilled") {
                return x.value;
            }

            sendInfo("", {
                operationName: "java.dependency.assessmentManager.getDependencyIssues",
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

async function getWorkspaceIssues(workspaceFolderUri: string): Promise<UpgradeIssue[]> {
    const projects = await Jdtls.getProjects(workspaceFolderUri);
    const projectsIssues = await Promise.allSettled(projects.map(async (projectNode) => {
        const issues = await getProjectIssues(projectNode);
        return issues;
    }));

    const workspaceIssues = projectsIssues.map(x => {
        if (x.status === "fulfilled") {
            return x.value;
        }

        sendInfo("", {
            operationName: "java.dependency.assessmentManager.getWorkspaceIssues",
        });
        return [];
    }).reduce((a, b) => [...a, ...b]);

    return workspaceIssues;
}

export default {
    getWorkspaceIssues,
};