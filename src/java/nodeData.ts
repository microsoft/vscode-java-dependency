// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

export enum NodeKind {
    Workspace = 1,
    Project = 2,
    Container = 3,
    PackageRoot = 4,
    Package = 5,
    PrimaryType = 6,
    Folder = 7,
    File = 8,
}

export enum TypeKind {
    Class = 1,
    Interface = 2,
    Enum = 3,
}

export interface INodeData {
    name: string;
    moduleName?: string;
    path?: string;
    /**
     * returned from Java side using `IJavaElement.getHandlerIdentifier();`
     */
    handlerIdentifier?: string;
    uri?: string;
    kind: NodeKind;
    children?: any[];
    metaData?: { [id: string]: any };
}
