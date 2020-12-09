// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { DocumentSymbol, Range, TreeItem, TreeItemCollapsibleState } from "vscode";
import { BaseSymbolNode } from "./baseSymbolNode";
import { ExplorerNode } from "./explorerNode";
import { PrimaryTypeNode } from "./PrimaryTypeNode";

export class DocumentSymbolNode extends BaseSymbolNode {

    constructor(symbolInfo: DocumentSymbol, parent: PrimaryTypeNode) {
        super(symbolInfo, parent);
    }

    public getChildren(): ExplorerNode[] | Thenable<ExplorerNode[]> {
        const res: ExplorerNode[] = [];
        if (this.symbolInfo && (<DocumentSymbol>this.symbolInfo).children && (<DocumentSymbol>this.symbolInfo).children.length) {
            (<DocumentSymbol>this.symbolInfo).children.forEach((child) => {
                res.push(new DocumentSymbolNode(child, this.getParent() as PrimaryTypeNode));
            });
        }
        return res;
    }

    public getTreeItem(): TreeItem | Promise<TreeItem> {
        const item = new TreeItem(this.symbolInfo.name,
            ((<DocumentSymbol>this.symbolInfo).children && (<DocumentSymbol>this.symbolInfo).children.length)
                ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None);
        item.iconPath = this.iconPath;
        item.command = this.command;
        return item;
    }

    protected get range(): Range {
        // Using `selectionRange` instead of `range` to make sure the cursor will be pointing to the codes, not the comments
        return (<DocumentSymbol>this.symbolInfo).selectionRange;
    }
}
