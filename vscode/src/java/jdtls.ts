import { commands } from "vscode";
import { Commands } from "../commands";
import { INodeData } from "./nodeData";

export namespace Jdtls {
    export function getProjects(params): Thenable<INodeData[]> {
        return commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_GETPROJECTS, params);
    }

    export function getPackageData(params): Thenable<INodeData[]> {
        return commands.executeCommand(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.JAVA_GETPACKAGEDATA, params);
    }
}