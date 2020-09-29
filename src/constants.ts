// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

export namespace Context {
    export const EXTENSION_ACTIVATED: string = "java:projectManagerActivated";
    export const SUPPORTED_BUILD_FILES: string = "java:supportedBuildFiles";
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
        SourceFile = "sourceFile"
    }
}

export namespace Build {
    export const FILE_NAMES: string[] = ["pom.xml", "build.gradle"];
}
