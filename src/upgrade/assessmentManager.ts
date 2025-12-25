// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fs from 'fs';
import * as semver from 'semver';
import * as glob from 'glob';
import { promisify } from 'util';

const globAsync = promisify(glob);
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
import { ContainerPath } from '../views/containerNode';

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

async function getWorkspaceIssues(projectDeps:{projectNode: INodeData, dependencies: PackageDescription[]}[]): Promise<UpgradeIssue[]> {

    const issues: UpgradeIssue[] = [];
    const dependenciesSet: Set<PackageDescription> = new Set();
    for (const { projectNode, dependencies } of projectDeps) {
        issues.push(...getJavaIssues(projectNode));
        dependencies.forEach(dep => dependenciesSet.add(dep));
    }
    issues.push(...await getCVEIssues(Array.from(dependenciesSet)));
    issues.push(...await getDependencyIssues(Array.from(dependenciesSet)));
    return issues;
}

/**
 * Find all pom.xml files in a directory using glob
 */
async function findAllPomFiles(dir: string): Promise<string[]> {
    try {
        return await globAsync('**/pom.xml', {
            cwd: dir,
            absolute: true,
            nodir: true,
            ignore: ['**/node_modules/**', '**/target/**', '**/.git/**', '**/.idea/**', '**/.vscode/**']
        });
    } catch {
        return [];
    }
}

/**
 * Parse dependencies from a single pom.xml file
 */
function parseDependenciesFromSinglePom(pomPath: string): Set<string> {
    const directDeps = new Set<string>();
    try {
        const pomContent = fs.readFileSync(pomPath, 'utf-8');

        // Extract dependencies from <dependencies> section (not inside <dependencyManagement>)
        // First, remove dependencyManagement sections to avoid including managed deps
        const withoutDepMgmt = pomContent.replace(/<dependencyManagement>[\s\S]*?<\/dependencyManagement>/g, '');

        // Match <dependency> blocks and extract groupId and artifactId
        const dependencyRegex = /<dependency>\s*<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>/g;
        let match = dependencyRegex.exec(withoutDepMgmt);
        while (match !== null) {
            const groupId = match[1].trim();
            const artifactId = match[2].trim();
            // Skip property references like ${project.groupId}
            if (!groupId.includes('${') && !artifactId.includes('${')) {
                directDeps.add(`${groupId}:${artifactId}`);
            }
            match = dependencyRegex.exec(withoutDepMgmt);
        }
    } catch {
        // If we can't read the pom, return empty set
    }
    return directDeps;
}

/**
 * Parse direct dependencies from all pom.xml files in the project.
 * Finds all pom.xml files starting from the project root and parses them to collect dependencies.
 */
async function parseDirectDependenciesFromPom(projectPath: string): Promise<Set<string>> {
    const directDeps = new Set<string>();

    // Find all pom.xml files in the project starting from the project root
    const allPomFiles = await findAllPomFiles(projectPath);

    // Parse each pom.xml and collect dependencies
    for (const pom of allPomFiles) {
        const deps = parseDependenciesFromSinglePom(pom);
        deps.forEach(dep => directDeps.add(dep));
    }

    return directDeps;
}

/**
 * Find all Gradle build files in a directory using glob
 */
async function findAllGradleFiles(dir: string): Promise<string[]> {
    try {
        return await globAsync('**/{build.gradle,build.gradle.kts}', {
            cwd: dir,
            absolute: true,
            nodir: true,
            ignore: ['**/node_modules/**', '**/build/**', '**/.git/**', '**/.idea/**', '**/.vscode/**', '**/.gradle/**']
        });
    } catch {
        return [];
    }
}

/**
 * Parse dependencies from a single Gradle build file
 */
function parseDependenciesFromSingleGradle(gradlePath: string): Set<string> {
    const directDeps = new Set<string>();
    try {
        const gradleContent = fs.readFileSync(gradlePath, 'utf-8');

        // Match common dependency configurations:
        // implementation 'group:artifact:version'
        // implementation "group:artifact:version"
        // api 'group:artifact:version'
        // compileOnly, runtimeOnly, testImplementation, etc.
        const shortFormRegex = /(?:implementation|api|compile|compileOnly|runtimeOnly|testImplementation|testCompileOnly|testRuntimeOnly)\s*\(?['"]([^:'"]+):([^:'"]+)(?::[^'"]*)?['"]\)?/g;
        let match = shortFormRegex.exec(gradleContent);
        while (match !== null) {
            const groupId = match[1].trim();
            const artifactId = match[2].trim();
            if (!groupId.includes('$') && !artifactId.includes('$')) {
                directDeps.add(`${groupId}:${artifactId}`);
            }
            match = shortFormRegex.exec(gradleContent);
        }

        // Match map notation: implementation group: 'x', name: 'y', version: 'z'
        const mapFormRegex = /(?:implementation|api|compile|compileOnly|runtimeOnly|testImplementation|testCompileOnly|testRuntimeOnly)\s*\(?group:\s*['"]([^'"]+)['"]\s*,\s*name:\s*['"]([^'"]+)['"]/g;
        match = mapFormRegex.exec(gradleContent);
        while (match !== null) {
            const groupId = match[1].trim();
            const artifactId = match[2].trim();
            if (!groupId.includes('$') && !artifactId.includes('$')) {
                directDeps.add(`${groupId}:${artifactId}`);
            }
            match = mapFormRegex.exec(gradleContent);
        }
    } catch {
        // If we can't read the gradle file, return empty set
    }
    return directDeps;
}

/**
 * Parse direct dependencies from all Gradle build files in the project.
 * Finds all build.gradle and build.gradle.kts files and parses them to collect dependencies.
 */
async function parseDirectDependenciesFromGradle(projectPath: string): Promise<Set<string>> {
    const directDeps = new Set<string>();

    // Find all Gradle build files in the project
    const allGradleFiles = await findAllGradleFiles(projectPath);

    // Parse each gradle file and collect dependencies
    for (const gradleFile of allGradleFiles) {
        const deps = parseDependenciesFromSingleGradle(gradleFile);
        deps.forEach(dep => directDeps.add(dep));
    }

    return directDeps;
}

export async function getDirectDependencies(projectNode: INodeData): Promise<PackageDescription[]> {
    const projectStructureData = await Jdtls.getPackageData({ kind: NodeKind.Project, projectUri: projectNode.uri });
    // Only include Maven or Gradle containers (not JRE or other containers)
    const dependencyContainers = projectStructureData.filter(x =>
        x.kind === NodeKind.Container &&
        (x.path?.startsWith(ContainerPath.Maven) || x.path?.startsWith(ContainerPath.Gradle))
    );

    if (dependencyContainers.length === 0) {
        return [];
    }

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

    if (!dependencies) {
        sendInfo("", {
            operationName: "java.dependency.assessmentManager.getDirectDependencies.noDependencyInfo"
        });
        return [];
    }

    // Determine build type from dependency containers
    const isMaven = dependencyContainers.some(x => x.path?.startsWith(ContainerPath.Maven));
    // Get direct dependency identifiers from build files
    let directDependencyIds: Set<string> | null = null;
    if (projectNode.uri && dependencyContainers.length > 0) {
        try {
            const projectPath = Uri.parse(projectNode.uri).fsPath;
            if (isMaven) {
                directDependencyIds = await parseDirectDependenciesFromPom(projectPath);
            } else {
                directDependencyIds = await parseDirectDependenciesFromGradle(projectPath);
            }
        } catch {
            // Ignore errors
        }
    }

    if (!directDependencyIds) {
        sendInfo("", {
            operationName: "java.dependency.assessmentManager.getDirectDependencies.noDirectDependencyInfo"
        });
        //TODO: fallback to return all dependencies if we cannot parse direct dependencies or just return empty?
        return dependencies;
    }
    // Filter to only direct dependencies if we have build file info
    if (directDependencyIds && directDependencyIds.size > 0) {
        dependencies = dependencies.filter(pkg =>
            directDependencyIds!.has(`${pkg.groupId}:${pkg.artifactId}`)
        );
    }

    return dependencies;
}

async function getCVEIssues(dependencies: PackageDescription[]): Promise<UpgradeIssue[]> {
    const gavCoordinates = dependencies.map(pkg => `${pkg.groupId}:${pkg.artifactId}:${pkg.version}`);
    return batchGetCVEIssues(gavCoordinates);
}

export default {
    getWorkspaceIssues,
};