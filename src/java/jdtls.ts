// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { CancellationToken, commands } from "vscode";
import { Commands, executeJavaLanguageServerCommand } from "../commands";
import { IClasspath } from "../exportJarSteps/IStepMetadata";
import { IMainClassInfo } from "../exportJarSteps/ResolveMainClassExecutor";
import { INodeData } from "./nodeData";

export namespace Jdtls {
    export async function getProjects(params: string): Promise<INodeData[]> {
        return await commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_PROJECT_LIST, params) || [];
    }

    export async function getProjectUris(): Promise<string[]> {
        return await commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.GET_ALL_PROJECTS) || [];
    }

    export async function refreshLibraries(params: string): Promise<boolean | undefined> {
        return commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_PROJECT_REFRESH_LIB_SERVER, params);
    }

    export async function getPackageData(params: { [key: string]: any }): Promise<INodeData[]> {
        return await commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_GETPACKAGEDATA, params) || [];
    }

    export async function resolvePath(params: string): Promise<INodeData[]> {
        return await commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_RESOLVEPATH, params) || [];
    }

    export async function getMainClasses(params: string): Promise<IMainClassInfo[]> {
        return await commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_PROJECT_GETMAINCLASSES, params) || [];
    }

    export async function exportJar(mainClass: string, classpaths: IClasspath[],
                                    destination: string, terminalId: string, token: CancellationToken): Promise<boolean | undefined> {
        return commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_PROJECT_GENERATEJAR,
            mainClass, classpaths, destination, terminalId, token);
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
