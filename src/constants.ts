// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

export namespace Context {
    export const EXTENSION_ACTIVATED: string = "java:projectManagerActivated";
    export const LANGUAGE_SUPPORT_INSTALLED: string = "java:languageSupportInstalled";
    export const NO_JAVA_PROJECT: string = "java:noJavaProjects";
    export const WORKSPACE_CONTAINS_BUILD_FILES: string = "java:workspaceContainsBuildFiles";
    export const RELOAD_PROJECT_ACTIVE: string = "java:reloadProjectActive";
}

export namespace Explorer {
    export enum ContextValueType {
        WorkspaceFolder = "workspaceFolder",
        Project = "project",
        Container = "container",
        PackageRoot = "packageRoot",
        Package = "package",
        Jar = "jar",
        File = "file",
        Type = "type",
        Folder = "folder",
        Symbol = "symbol",
    }

    export enum Mime {
        JavaProjectExplorer = "application/vnd.code.tree.javaProjectExplorer",
        TextUriList = "text/uri-list",
    }
}

export namespace ExtensionName {
    export const JAVA_LANGUAGE_SUPPORT: string = "redhat.java";
}

/**
 * The files names for all the build files we support.
 */
export const buildFiles = ["pom.xml", "build.gradle", "settings.gradle", "build.gradle.kts", "settings.gradle.kts"];
