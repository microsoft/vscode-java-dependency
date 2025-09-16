// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as semver from 'semver';
import { Jdtls } from "../java/jdtls";
import { NodeKind, type INodeData } from "../java/nodeData";
import { type DependencyCheckItem, UpgradeReason, type UpgradeIssue } from "./type";
import { DEPENDENCY_JAVA_RUNTIME } from "./dependency.metadata";
import { Upgrade } from '../constants';
import { buildPackageId } from './utility';
import metadataManager from './metadataManager';
import { sendInfo } from 'vscode-extension-telemetry-wrapper';

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
    const { reason } = supportedVersionDefinition;
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

function getDependencyIssue(data: INodeData): UpgradeIssue | null {
    const versionString = data.metaData?.["maven.version"];
    const groupId = data.metaData?.["maven.groupId"];
    const artifactId = data.metaData?.["maven.artifactId"];
    const packageId = buildPackageId(groupId, artifactId);
    const supportedVersionDefinition = metadataManager.getMetadataById(packageId);
    if (!versionString || !groupId || !supportedVersionDefinition) {
        return null;
    }

    return getUpgradeForDependency(versionString, supportedVersionDefinition, packageId);
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

                return packages.map(getDependencyIssue).filter((x): x is UpgradeIssue => Boolean(x));
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
        sendInfo("", {
            operationName: "java.dependency.assessmentManager.getWorkspaceIssues",
            issuesFoundForPackageId: JSON.stringify(issues.map(x => `${x.packageId}:${x.currentVersion}`)),
        });
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