// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Command, ProviderResult, TreeItem } from "vscode";

export abstract class ExplorerNode {

    constructor(private _parent?: ExplorerNode) {
    }

    public getParent(): ExplorerNode | undefined {
        return this._parent;
    }

    public isItselfOrAncestorOf(node: ExplorerNode | undefined | null, levelToCheck: number = Number.MAX_VALUE) {
        while (node && levelToCheck >= 0) {
            if (this === node) {
                return true;
            }
            node = node.getParent();
            levelToCheck--;
        }

        return false;
    }

    protected get command(): Command | undefined {
        return undefined;
    }

    public abstract getChildren(): ProviderResult<ExplorerNode[]>;

    public abstract getTreeItem(): TreeItem | Promise<TreeItem>;
}
