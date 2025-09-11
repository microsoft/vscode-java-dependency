// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.


import * as minimatch from "minimatch";
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
        const uri: Uri | null = !params.projectUri ? null : Uri.parse(params.projectUri);
        const excludePatterns: {[key: string]: boolean} | undefined = workspace.getConfiguration("files", uri).get("exclude");

        let nodeData: INodeData[] = await commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND,
            Commands.JAVA_GETPACKAGEDATA, params) || [];

        // check filter settings.
        if (Settings.nonJavaResourcesFiltered()) {
            nodeData = nodeData.filter((data: INodeData) => {
                return data.kind !== NodeKind.Folder && data.kind !== NodeKind.File;
            });
        }

        if (excludePatterns && nodeData.length) {
            const uriOfChildren: string[] = nodeData.map((node: INodeData) => node.uri).filter(Boolean) as string[];
            const urisToExclude: Set<string> = new Set<string>();
            for (const pattern in excludePatterns) {
                if (excludePatterns[pattern]) {
                    const toExclude: string[] = minimatch.match(uriOfChildren, pattern);
                    toExclude.forEach((uriToExclude: string) => urisToExclude.add(uriToExclude));
                }
            }

            if (urisToExclude.size) {
                nodeData = nodeData.filter((node: INodeData) => {
                    if (!node.uri) {
                        return true;
                    }
                    return !urisToExclude.has(node.uri);
                });
            }
        }
        return nodeData;
    }

    export async function resolvePath(params: string): Promise<INodeData[]> {
        return await commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_RESOLVEPATH, params) || [];
    }

    export async function getMainClasses(params: string): Promise<IMainClassInfo[]> {
        return await commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_PROJECT_GETMAINCLASSES, params) || [];
    }

    export async function resolveCopilotRequest(fileUri: string): Promise<string[]> {
        return await commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_PROJECT_RESOLVE_COPILOT_REQUEST, fileUri) || [];
    }

    export async function exportJar(mainClass: string, classpaths: IClasspath[],
                                    destination: string, terminalId: string, token: CancellationToken): Promise<boolean | undefined> {
        return commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_PROJECT_GENERATEJAR,
            mainClass, classpaths, destination, terminalId, token);
    }

    export async function checkImportStatus(): Promise<boolean> {
        return commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_PROJECT_CHECK_IMPORT_STATUS) || false;
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

interface IPackageDataParam {
    projectUri: string | undefined;
    [key: string]: any;
}