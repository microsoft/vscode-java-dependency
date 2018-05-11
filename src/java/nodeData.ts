// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

export enum NodeKind {
    Workspace = 1,
    Project = 2,
    Container = 3,
    PackageRoot = 4,
    Package = 5,
    TypeRoot = 6,
    Folder = 7,
    File = 8,
}

export interface INodeData {
    name: string;
    moduleName?: string;
    path?: string;
    uri?: string;
    kind: NodeKind;
    children?: any[];
}
