// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';
import { Uri } from 'vscode';
import { Jdtls } from "../java/jdtls";
import { NodeKind, type INodeData } from "../java/nodeData";
import { type DependencyCheckItem, type UpgradeIssue, type PackageDescription, UpgradeReason } from "./type";
import { DEPENDENCY_JAVA_RUNTIME } from "./dependency.metadata";
import { Upgrade } from '../constants';
import { buildPackageId } from './utility';
import metadataManager from './metadataManager';
import { sendInfo } from 'vscode-extension-telemetry-wrapper';
import { batchGetCVEIssues } from './cve';

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
    const versionList = [...versions].sort((a, b) => {
        const semverA = semver.coerce(a);
        const semverB = semver.coerce(b);
        if (!semverA || !semverB) {
            return a.localeCompare(b);
        }
        return semver.compare(semverA, semverB);
    });
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

    const [javaRuntimeGroupId, javaRuntimeArtifactId] = Upgrade.PACKAGE_ID_FOR_JAVA_RUNTIME.split(":");
    sendInfo("", {
        operationName: "java.dependency.assessmentManager.getJavaVersionRange",
        versionRangeByGroupId: JSON.stringify(
            collectVersionRange([{
                groupId: javaRuntimeGroupId,
                artifactId: javaRuntimeArtifactId,
                version: String(javaVersion),
            }]),
        ),
    });

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

async function getDependencyIssues(dependencies: PackageDescription[]): Promise<UpgradeIssue[]> {

    const issues = dependencies.map(getDependencyIssue).filter((x): x is UpgradeIssue => Boolean(x));
    const versionRangeByGroupId = collectVersionRange(dependencies.filter(pkg => getPackageUpgradeMetadata(pkg)));
    if (Object.keys(versionRangeByGroupId).length > 0) {
        sendInfo("", {
            operationName: "java.dependency.assessmentManager.getDependencyVersionRange",
            versionRangeByGroupId: JSON.stringify(versionRangeByGroupId),
        });
    }

    return issues;
}

async function getProjectIssues(projectNode: INodeData): Promise<UpgradeIssue[]> {
    const issues: UpgradeIssue[] = [];
    const dependencies = await getDirectDependencies(projectNode);
    issues.push(...await getCVEIssues(dependencies));
    issues.push(...getJavaIssues(projectNode));
    issues.push(...await getDependencyIssues(dependencies));

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
    }).flat();

    return workspaceIssues;
}

const MAVEN_CONTAINER_PATH = "org.eclipse.m2e.MAVEN2_CLASSPATH_CONTAINER";
const GRADLE_CONTAINER_PATH = "org.eclipse.buildship.core.gradleclasspathcontainer";

/**
 * Parse direct dependencies from pom.xml file.
 * Also checks parent pom.xml for multi-module projects.
 */
function parseDirectDependenciesFromPom(pomPath: string): Set<string> {
    const directDeps = new Set<string>();
    try {
        const pomContent = fs.readFileSync(pomPath, 'utf-8');
        
        // Extract dependencies from <dependencies> section (not inside <dependencyManagement>)
        // First, remove dependencyManagement sections to avoid including managed deps
        const withoutDepMgmt = pomContent.replace(/<dependencyManagement>[\s\S]*?<\/dependencyManagement>/g, '');
        
        // Match <dependency> blocks and extract groupId and artifactId
        const dependencyRegex = /<dependency>\s*<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>/g;
        let match;
        while ((match = dependencyRegex.exec(withoutDepMgmt)) !== null) {
            const groupId = match[1].trim();
            const artifactId = match[2].trim();
            // Skip property references like ${project.groupId}
            if (!groupId.includes('${') && !artifactId.includes('${')) {
                directDeps.add(`${groupId}:${artifactId}`);
            }
        }

        // Check for parent pom in multi-module projects
        const parentPomPath = path.join(path.dirname(pomPath), '..', 'pom.xml');
        if (fs.existsSync(parentPomPath)) {
            const parentDeps = parseDirectDependenciesFromPom(parentPomPath);
            parentDeps.forEach(dep => directDeps.add(dep));
        }
    } catch {
        // If we can't read the pom, return empty set
    }
    return directDeps;
}

/**
 * Parse direct dependencies from build.gradle or build.gradle.kts file
 */
function parseDirectDependenciesFromGradle(gradlePath: string): Set<string> {
    const directDeps = new Set<string>();
    try {
        const gradleContent = fs.readFileSync(gradlePath, 'utf-8');
        
        // Match common dependency configurations:
        // implementation 'group:artifact:version'
        // implementation "group:artifact:version"
        // api 'group:artifact:version'
        // compileOnly, runtimeOnly, testImplementation, etc.
        const shortFormRegex = /(?:implementation|api|compile|compileOnly|runtimeOnly|testImplementation|testCompileOnly|testRuntimeOnly)\s*\(?['"]([^:'"]+):([^:'"]+)(?::[^'"]*)?['"]\)?/g;
        let match;
        while ((match = shortFormRegex.exec(gradleContent)) !== null) {
            const groupId = match[1].trim();
            const artifactId = match[2].trim();
            if (!groupId.includes('$') && !artifactId.includes('$')) {
                directDeps.add(`${groupId}:${artifactId}`);
            }
        }

        // Match map notation: implementation group: 'x', name: 'y', version: 'z'
        const mapFormRegex = /(?:implementation|api|compile|compileOnly|runtimeOnly|testImplementation|testCompileOnly|testRuntimeOnly)\s*\(?group:\s*['"]([^'"]+)['"]\s*,\s*name:\s*['"]([^'"]+)['"]/g;
        while ((match = mapFormRegex.exec(gradleContent)) !== null) {
            const groupId = match[1].trim();
            const artifactId = match[2].trim();
            if (!groupId.includes('$') && !artifactId.includes('$')) {
                directDeps.add(`${groupId}:${artifactId}`);
            }
        }
    } catch {
        // If we can't read the gradle file, return empty set
    }
    return directDeps;
}

/**
 * Find the build file (pom.xml or build.gradle) for a project
 */
function findBuildFile(projectUri: string | undefined): { path: string; type: 'maven' | 'gradle' } | null {
    if (!projectUri) {
        return null;
    }
    try {
        const projectPath = Uri.parse(projectUri).fsPath;
        
        // Check for Maven
        const pomPath = path.join(projectPath, 'pom.xml');
        if (fs.existsSync(pomPath)) {
            return { path: pomPath, type: 'maven' };
        }
        
        // Check for Gradle Kotlin DSL
        const gradleKtsPath = path.join(projectPath, 'build.gradle.kts');
        if (fs.existsSync(gradleKtsPath)) {
            return { path: gradleKtsPath, type: 'gradle' };
        }
        
        // Check for Gradle Groovy DSL
        const gradlePath = path.join(projectPath, 'build.gradle');
        if (fs.existsSync(gradlePath)) {
            return { path: gradlePath, type: 'gradle' };
        }
    } catch {
        // Ignore errors
    }
    return null;
}

/**
 * Parse direct dependencies from build file (Maven or Gradle)
 */
function parseDirectDependencies(buildFile: { path: string; type: 'maven' | 'gradle' }): Set<string> {
    if (buildFile.type === 'maven') {
        return parseDirectDependenciesFromPom(buildFile.path);
    } else {
        return parseDirectDependenciesFromGradle(buildFile.path);
    }
}

async function getDirectDependencies(projectNode: INodeData): Promise<PackageDescription[]> {
    const projectStructureData = await Jdtls.getPackageData({ kind: NodeKind.Project, projectUri: projectNode.uri });
    // Only include Maven or Gradle containers (not JRE or other containers)
    const dependencyContainers = projectStructureData.filter(x =>
        x.kind === NodeKind.Container &&
        (x.path?.startsWith(MAVEN_CONTAINER_PATH) || x.path?.startsWith(GRADLE_CONTAINER_PATH))
    );

    // Get direct dependency identifiers from build file
    const buildFile = findBuildFile(projectNode.uri);
    const directDependencyIds = buildFile ? parseDirectDependencies(buildFile) : null;

    const allPackages = await Promise.allSettled(
        dependencyContainers.map(async (packageContainer) => {
            const packageNodes = await Jdtls.getPackageData({
                kind: NodeKind.Container,
                projectUri: projectNode.uri,
                path: packageContainer.path,
            });
            return packageNodes
                .map(packageNodeToDescription)
                .filter((x): x is PackageDescription => Boolean(x));
        })
    );

    const fulfilled = allPackages.filter((x): x is PromiseFulfilledResult<PackageDescription[]> => x.status === "fulfilled");
    const failedPackageCount = allPackages.length - fulfilled.length;
    if (failedPackageCount > 0) {
        sendInfo("", {
            operationName: "java.dependency.assessmentManager.getDirectDependencies.rejected",
            failedPackageCount: String(failedPackageCount),
        });
    }

    let dependencies = fulfilled.map(x => x.value).flat();

    // Filter to only direct dependencies if we have build file info
    if (directDependencyIds && directDependencyIds.size > 0) {
        dependencies = dependencies.filter(pkg => 
            directDependencyIds.has(`${pkg.groupId}:${pkg.artifactId}`)
        );
    }

    // Deduplicate by GAV coordinates
    const seen = new Set<string>();
    return dependencies.filter(pkg => {
        const key = `${pkg.groupId}:${pkg.artifactId}:${pkg.version}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

async function getCVEIssues(dependencies: PackageDescription[]): Promise<UpgradeIssue[]> {
    const gavCoordinates = dependencies.map(pkg => `${pkg.groupId}:${pkg.artifactId}:${pkg.version}`);
    return batchGetCVEIssues(gavCoordinates);
}

export default {
    getWorkspaceIssues,
};