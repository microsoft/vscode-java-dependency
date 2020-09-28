// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

export namespace Context {
    export const EXTENSION_ACTIVATED: string = "java:projectManagerActivated";
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
