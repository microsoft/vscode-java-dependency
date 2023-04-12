// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.
import { commands } from "vscode";
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

    export const VIEW_PACKAGE_INTERNAL_REFRESH = "_java.view.package.internal.refresh";

    export const VIEW_PACKAGE_OUTLINE = "java.view.package.outline";

    export const VIEW_PACKAGE_REVEAL_FILE_OS = "java.view.package.revealFileInOS";

    export const VIEW_PACKAGE_COPY_FILE_PATH = "java.view.package.copyFilePath";

    export const VIEW_PACKAGE_COPY_RELATIVE_FILE_PATH = "java.view.package.copyRelativeFilePath";

    export const VIEW_PACKAGE_EXPORT_JAR = "java.view.package.exportJar";

    export const EXPORT_JAR_REPORT = "java.view.package.exportJarReport";

    export const VIEW_PACKAGE_NEW_JAVA_CLASS = "java.view.package.newJavaClass";

    export const VIEW_PACKAGE_NEW_JAVA_PACKAGE = "java.view.package.newPackage";

    export const VIEW_PACKAGE_RENAME_FILE = "java.view.package.renameFile";

    export const VIEW_PACKAGE_MOVE_FILE_TO_TRASH = "java.view.package.moveFileToTrash";

    export const VIEW_PACKAGE_DELETE_FILE_PERMANENTLY = "java.view.package.deleteFilePermanently";

    export const VIEW_PACKAGE_REVEAL_IN_PROJECT_EXPLORER = "java.view.package.revealInProjectExplorer";

    export const VIEW_PACKAGE_NEW_FILE = "java.view.package.newFile";

    export const VIEW_PACKAGE_NEW_FOLDER = "java.view.package.newFolder";

    export const VIEW_MENUS_FILE_NEW_JAVA_CLASS = "java.view.menus.file.newJavaClass";

    export const JAVA_PROJECT_OPEN = "_java.project.open";

    export const JAVA_PROJECT_CREATE = "java.project.create";

    export const JAVA_PROJECT_ADD_LIBRARIES = "java.project.addLibraries";

    export const JAVA_PROJECT_ADD_LIBRARY_FOLDERS = "java.project.addLibraryFolders";

    export const JAVA_PROJECT_REMOVE_LIBRARY = "java.project.removeLibrary";

    export const JAVA_PROJECT_REFRESH_LIBRARIES = "java.project.refreshLibraries";

    export const JAVA_PROJECT_BUILD_WORKSPACE = "java.project.build.workspace";

    export const JAVA_PROJECT_CLEAN_WORKSPACE = "java.project.clean.workspace";

    export const JAVA_PROJECT_UPDATE = "java.project.update";

    export const JAVA_PROJECT_RELOAD_ACTIVE_FILE = "java.project.reloadProjectFromActiveFile";

    export const JAVA_PROJECT_REBUILD = "java.project.rebuild";

    export const JAVA_PROJECT_EXPLORER_FOCUS = "javaProjectExplorer.focus";

    export const JAVA_PROJECT_LIST = "java.project.list";

    export const JAVA_PROJECT_REFRESH_LIB_SERVER = "java.project.refreshLib";

    export const JAVA_GETPACKAGEDATA = "java.getPackageData";

    export const JAVA_RESOLVEPATH = "java.resolvePath";

    export const JAVA_PROJECT_GETMAINCLASSES = "java.project.getMainClasses";

    export const JAVA_PROJECT_GENERATEJAR = "java.project.generateJar";

    export const JAVA_BUILD_WORKSPACE = "java.workspace.compile";

    export const JAVA_CLEAN_WORKSPACE = "java.clean.workspace";

    export const JAVA_PROJECT_CONFIGURATION_UPDATE = "java.projectConfiguration.update";

    export const JAVA_RESOLVE_BUILD_FILES = "vscode.java.resolveBuildFiles";

    export const JAVA_PROJECT_LIST_SOURCE_PATHS = "java.project.listSourcePaths";

    export const INSTALL_EXTENSION = "java.project.installExtension";

    export const JAVA_UPDATE_DEPRECATED_TASK = "java.updateDeprecatedTask";

    export const JAVA_PROJECT_CHECK_IMPORT_STATUS = "java.project.checkImportStatus";

    /**
     * Commands from Visual Studio Code
     */
    export const VSCODE_OPEN_FOLDER = "vscode.openFolder";

    export const VSCODE_OPEN = "vscode.open";

    export const WORKBENCH_ACTION_FILES_OPENFOLDER = "workbench.action.files.openFolder";

    export const WORKBENCH_ACTION_FILES_OPENFILEFOLDER = "workbench.action.files.openFileFolder";

    export const WORKBENCH_VIEW_PROBLEMS = "workbench.actions.view.problems";

    /**
     * Commands from JLS
     */
    export const LIST_SOURCEPATHS = "java.project.listSourcePaths";

    export const COMPILE_WORKSPACE = "java.workspace.compile";

    export const GET_ALL_PROJECTS = "java.project.getAll";

    export const BUILD_PROJECT = "java.project.build";
}

export function executeJavaLanguageServerCommand(...rest: any[]) {
    return executeJavaExtensionCommand(Commands.EXECUTE_WORKSPACE_COMMAND, ...rest);
}

export async function executeJavaExtensionCommand(commandName: string, ...rest: any[]) {
    // TODO: need to handle error and trace telemetry
    return commands.executeCommand(commandName, ...rest);
}
