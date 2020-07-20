// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.
import { commands } from "vscode";
import { getJavaExtension, JavaExtensionNotEnabledError } from "./utility";
/**
 * Commonly used commands
 */
export namespace Commands {
    /**
     * Execute Workspace Command
     */
    export const EXECUTE_WORKSPACE_COMMAND = "java.execute.workspaceCommand";

    export const VIEW_PACKAGE_CHANGETOFLATPACKAGEVIEW = "java.view.package.changeToFlatPackageView";

    export const VIEW_PACKAGE_CHANGETOHIERARCHICALPACKAGEVIEW = "java.view.package.changeToHierarchicalPackageView";

    export const VIEW_PACKAGE_LINKWITHFOLDER = "java.view.package.linkWithFolderExplorer";

    export const VIEW_PACKAGE_UNLINKWITHFOLDER = "java.view.package.unlinkWithFolderExplorer";

    export const VIEW_PACKAGE_REFRESH = "java.view.package.refresh";

    export const VIEW_PACKAGE_OPEN_FILE = "java.view.package.openFile";

    export const VIEW_PACKAGE_OUTLINE = "java.view.package.outline";

    export const VIEW_PACKAGE_REVEAL_FILE_OS = "java.view.package.revealFileInOS";

    export const VIEW_PACKAGE_COPY_FILE_PATH = "java.view.package.copyFilePath";

    export const VIEW_PACKAGE_COPY_RELATIVE_FILE_PATH = "java.view.package.copyRelativeFilePath";

    export const VIEW_PACKAGE_EXPORT_JAR = "java.view.package.exportJar";

    export const JAVA_PROJECT_CREATE = "java.project.create";

    export const JAVA_PROJECT_ADD_LIBRARIES = "java.project.addLibraries";

    export const JAVA_PROJECT_REMOVE_LIBRARY = "java.project.removeLibrary";

    export const JAVA_PROJECT_REFRESH_LIBRARIES = "java.project.refreshLibraries";

    export const JAVA_MAVEN_PROJECT_ADD_DEPENDENCY = "java.project.maven.addDependency";

    export const JAVA_MAVEN_CREATE_PROJECT = "maven.archetype.generate";

    export const JAVA_PROJECT_LIST = "java.project.list";

    export const JAVA_PROJECT_REFRESH_LIB_SERVER = "java.project.refreshLib";

    export const JAVA_GETPACKAGEDATA = "java.getPackageData";

    export const JAVA_PROJECT_SWITCH_SERVER_MODE = "java.project.switch.server.mode";

    /**
     * command from VS Code Java to switch the language server mode
     */
    export const JAVA_SWITCH_SERVER_MODE = "java.server.mode.switch";

    export const JAVA_RESOLVEPATH = "java.resolvePath";

    export const JAVA_PROJECT_GETMAINMETHOD = "java.project.getMainMethod";

    export const JAVA_PROJECT_EXPORTJAR = "java.project.exportJar";

    export const VSCODE_OPEN_FOLDER = "vscode.openFolder";
}

export const JAVA_BUILD_WORKSPACE = "java.workspace.compile";

export const JAVA_EXECUTE_WORKSPACE_COMMAND = "java.execute.workspaceCommand";

export const JAVA_RESOLVE_BUILD_FILES = "vscode.java.resolveBuildFiles";

export function executeJavaLanguageServerCommand(...rest) {
    return executeJavaExtensionCommand(JAVA_EXECUTE_WORKSPACE_COMMAND, ...rest);
}

export async function executeJavaExtensionCommand(commandName: string, ...rest) {
    // TODO: need to handle error and trace telemetry
    const javaExtension = getJavaExtension();
    if (!javaExtension) {
        throw new JavaExtensionNotEnabledError(`Cannot execute command ${commandName}, VS Code Java Extension is not enabled.`);
    }
    if (!javaExtension.isActive) {
        await javaExtension.activate();
    }
    return commands.executeCommand(commandName, ...rest);
}
