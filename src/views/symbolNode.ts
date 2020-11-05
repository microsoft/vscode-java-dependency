// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Range, SymbolInformation, TreeItem, TreeItemCollapsibleState } from "vscode";
import { ITypeRootNodeData } from "../java/typeRootNodeData";
import { BaseSymbolNode } from "./baseSymbolNode";
import { ExplorerNode } from "./explorerNode";
import { PrimaryTypeNode } from "./PrimaryTypeNode";

export class SymbolNode extends BaseSymbolNode {
    private _children: SymbolInformation[];

    constructor(symbolInfo: SymbolInformation, parent: PrimaryTypeNode) {
        super(symbolInfo, parent);
    }

    public getChildren(): ExplorerNode[] | Thenable<ExplorerNode[]> {
        const res: ExplorerNode[] = [];
        if (this._children && this._children.length) {
            this._children.forEach((child) => {
                res.push(new SymbolNode(child, this.getParent() as PrimaryTypeNode));
            });
        }
        return res;
    }

    public getTreeItem(): TreeItem | Promise<TreeItem> {
        if (this.symbolInfo) {
            const parentData = <ITypeRootNodeData>(<PrimaryTypeNode>this.getParent()).nodeData;
            if (parentData && parentData.symbolTree) {
                this._children = parentData.symbolTree.get(this.symbolInfo.name);
            }
            const item = new TreeItem(this.symbolInfo.name,
                (this._children && this._children.length) ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None);
            item.iconPath = this.iconPath;
            item.command = this.command;
            return item;
        } else {
            return null;
        }
    }

    protected get range(): Range {
        return (<SymbolInformation>this.symbolInfo).location.range;
    }
}
