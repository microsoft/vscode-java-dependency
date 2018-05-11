// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { SymbolInformation } from "vscode";
import { INodeData } from "./nodeData";

export enum TypeRootKind {
    /**
     * Kind constant for a source path root. Indicates this root
     * only contains source files.
     */
    K_SOURCE = 1,
    /**
     * Kind constant for a binary path root. Indicates this
     * root only contains binary files.
     */
    K_BINARY = 2,
}

export interface ITypeRootNodeData extends INodeData {
    entryKind: TypeRootKind;

    symbolTree?: Map<string, SymbolInformation[]>;
}
