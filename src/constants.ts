// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

export namespace Context {
    export const EXTENSION_ACTIVATED: string = "extensionActivated";
}

export namespace Explorer {
    export const DEFAULT_PACKAGE_NAME: string = "default-package";
    export enum ContextValueType {
        Workspace = "workspace",
        Project = "project",
        Container = "container",
        PackageRoot = "packageRoot",
        Package = "package",
        Jar = "jar",
    }
}
