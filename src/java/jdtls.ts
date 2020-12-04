// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands } from "vscode";
import { Commands, executeJavaLanguageServerCommand } from "../commands";
import { IExportResult } from "../exportJarSteps/GenerateJarExecutor";
import { IClasspath } from "../exportJarSteps/IStepMetadata";
import { IMainClassInfo } from "../exportJarSteps/ResolveMainClassExecutor";
import { INodeData } from "./nodeData";

export namespace Jdtls {
    export function getProjects(params: string): Thenable<INodeData[] | undefined> {
        return commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_PROJECT_LIST, params);
    }

    export function refreshLibraries(params: string): Thenable<boolean | undefined> {
        return commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_PROJECT_REFRESH_LIB_SERVER, params);
    }

    export function getPackageData(params: {[key: string]: any}): Thenable<INodeData[] | undefined> {
        return commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_GETPACKAGEDATA, params);
    }

    export function resolvePath(params: string): Thenable<INodeData[] | undefined> {
        return commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_RESOLVEPATH, params);
    }

    export function getMainClasses(params: string): Thenable<IMainClassInfo[] | undefined> {
        return commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_PROJECT_GETMAINCLASSES, params);
    }

    export function exportJar(mainClass: string, classpaths: IClasspath[], destination: string): Thenable<IExportResult | undefined> {
        return commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_PROJECT_GENERATEJAR,
            mainClass, classpaths, destination);
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
