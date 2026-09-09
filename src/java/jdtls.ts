// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.


import { minimatch } from "minimatch";
import { CancellationToken, Uri, commands, workspace } from "vscode";
import { Commands, executeJavaLanguageServerCommand } from "../commands";
import { IClasspath } from "../tasks/buildArtifact/IStepMetadata";
import { IMainClassInfo } from "../tasks/buildArtifact/ResolveMainClassExecutor";
import { INodeData, NodeKind } from "./nodeData";
import { Settings } from "../settings";

export namespace Jdtls {
    export async function getProjects(params: string): Promise<INodeData[]> {
        return await commands.executeCommand(
            Commands.EXECUTE_WORKSPACE_COMMAND,
            Commands.JAVA_PROJECT_LIST,
            params,
            Settings.nonJavaResourcesFiltered()
        ) || [];
    }

    export async function getProjectUris(): Promise<string[]> {
        return await commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.GET_ALL_PROJECTS) || [];
    }

    export async function refreshLibraries(params: string): Promise<boolean | undefined> {
        return commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_PROJECT_REFRESH_LIB_SERVER, params);
    }

    export async function getPackageData(params: IPackageDataParam): Promise<INodeData[]> {
        const nonJavaResourcesFiltered: boolean = Settings.nonJavaResourcesFiltered();
        const isVisible = createNodeVisibilityFilter(params.projectUri, nonJavaResourcesFiltered);
        params.mergeBuildOutputSourceRoots ??= !nonJavaResourcesFiltered;

        const nodeData: INodeData[] = await commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND,
            Commands.JAVA_GETPACKAGEDATA, params) || [];

        return nodeData.filter(node => isVisible(node)
            && (!params.mergeBuildOutputSourceRoots || params.kind !== NodeKind.Project || !getVisibleBuildOutputPath(node, isVisible)));
    }

    export async function resolvePath(params: string): Promise<INodeData[]> {
        const nonJavaResourcesFiltered = Settings.nonJavaResourcesFiltered();
        const nodes: INodeData[] = await commands.executeCommand(
            Commands.EXECUTE_WORKSPACE_COMMAND,
            Commands.JAVA_RESOLVEPATH,
            params,
            !nonJavaResourcesFiltered,
        ) || [];
        const projectUri = nodes.find(node => node.kind === NodeKind.Project)?.uri;
        const isVisible = createNodeVisibilityFilter(projectUri, nonJavaResourcesFiltered);
        return nodes.reduce<INodeData[]>((result, node) =>
            result.concat(getVisibleBuildOutputPath(node, isVisible) || [node]), []);
    }

    export async function getMainClasses(params: string): Promise<IMainClassInfo[]> {
        return await commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_PROJECT_GETMAINCLASSES, params) || [];
    }

    export async function exportJar(mainClass: string, classpaths: IClasspath[],
                                    destination: string, terminalId: string, token: CancellationToken): Promise<boolean | undefined> {
        return commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_PROJECT_GENERATEJAR,
            mainClass, classpaths, destination, terminalId, token);
    }

    export async function checkImportStatus(): Promise<boolean> {
        return commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_PROJECT_CHECK_IMPORT_STATUS) || false;
    }

    export async function getProjectDependencies(projectUri: string): Promise<IDependencyInfo[]> {
        return await commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_PROJECT_GET_DEPENDENCIES, projectUri) || [];
    }

    export enum CompileWorkspaceStatus {
        Failed = 0,
        Succeed = 1,
        Witherror = 2,
        Cancelled = 3,
    }

    export function resolveBuildFiles(): Promise<string[]> {
        return <Promise<string[]>>executeJavaLanguageServerCommand(Commands.JAVA_RESOLVE_BUILD_FILES);
    }
}

function createNodeVisibilityFilter(projectUri: string | undefined, nonJavaResourcesFiltered: boolean): (node: INodeData) => boolean {
    const uri = projectUri ? Uri.parse(projectUri) : null;
    const excludePatterns: {[key: string]: boolean} = workspace.getConfiguration("files", uri).get("exclude") || {};
    const patterns = Object.keys(excludePatterns).filter(pattern => excludePatterns[pattern]);
    return node => {
        if (nonJavaResourcesFiltered && (node.kind === NodeKind.Folder || node.kind === NodeKind.File)) {
            return false;
        }
        const nodeUri = node.uri;
        return !nodeUri || !patterns.some(pattern => minimatch(nodeUri, pattern));
    };
}

function getVisibleBuildOutputPath(node: INodeData, isVisible: (node: INodeData) => boolean): INodeData[] | undefined {
    if (node.kind === NodeKind.PackageRoot && node.buildOutputPath?.length && node.buildOutputPath.every(isVisible)) {
        return node.buildOutputPath;
    }
    return undefined;
}

interface IPackageDataParam {
    projectUri: string | undefined;
    /** Set false to request logical source roots rather than their merged explorer layout. */
    mergeBuildOutputSourceRoots?: boolean;
    [key: string]: any;
}

export interface IDependencyInfo {
    key: string;
    value: string;
}