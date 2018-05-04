// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Command, ProviderResult, TreeItem } from "vscode";

export abstract class ExplorerNode {
    constructor() {
    }

    protected get command(): Command {
        return undefined;
    }

    public abstract getChildren(): ProviderResult<ExplorerNode[]>;

    public abstract getTreeItem(): TreeItem | Promise<TreeItem>;
}
