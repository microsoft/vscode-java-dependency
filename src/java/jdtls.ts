// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands } from "vscode";
import { Commands } from "../commands";
import { MainMethodInfo } from "../views/exportJarFile";
import { INodeData } from "./nodeData";

export namespace Jdtls {
    export function getProjects(params): Thenable<INodeData[]> {
        return commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_PROJECT_LIST, params);
    }

    export function refreshLibraries(params): Thenable<boolean> {
        return commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_PROJECT_REFRESH_LIB_SERVER, params);
    }

    export function getPackageData(params): Thenable<INodeData[]> {
        return commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_GETPACKAGEDATA, params);
    }

    export function resolvePath(params): Thenable<INodeData[]> {
        return commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_RESOLVEPATH, params);
    }

    export function getMainMethod(): Thenable<MainMethodInfo[]> {
        return commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_PROJECT_GETMAINMETHOD);
    }

    export function exportJar(mainMethod, elements, destination): Thenable<boolean> {
        return commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_PROJECT_EXPORTJAR, mainMethod, elements, destination);
    }
}
