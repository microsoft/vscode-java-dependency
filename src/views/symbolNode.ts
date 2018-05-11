// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Command, SymbolInformation, SymbolKind, TreeItem, TreeItemCollapsibleState } from "vscode";
import { Commands } from "../commands";
import { ITypeRootNodeData } from "../java/typeRootNodeData";
import { Services } from "../services";
import { ExplorerNode } from "./explorerNode";
import { TypeRootNode } from "./typeRootNode";

export class SymbolNode extends ExplorerNode {

    private static _iconMap: Map<SymbolKind, string> = new Map([
        [SymbolKind.Class, "Class"],
        [SymbolKind.Interface, "Interface"],
        [SymbolKind.Enum, "Enumerator"],
        [SymbolKind.EnumMember, "EnumItem"],
        [SymbolKind.Constant, "Constant"],
        [SymbolKind.Method, "Method"],
        [SymbolKind.Function, "Method"],
        [SymbolKind.Constructor, "Method"],
        [SymbolKind.Field, "Field"],
        [SymbolKind.Property, "Property"],
        [SymbolKind.Variable, "LocalVariable"],
        [SymbolKind.Constant, "Constant"],

    ]);

    private _children: SymbolInformation[];

    constructor(public readonly symbolInfo: SymbolInformation, private _prarent: TypeRootNode) {
        super();
    }

    public getChildren(): ExplorerNode[] | Thenable<ExplorerNode[]> {
        const res: ExplorerNode[] = [];
        if (this._children && this._children.length) {
            this._children.forEach((child) => {
                res.push(new SymbolNode(child, this._prarent));
            });
        }
        return res;
    }

    public getTreeItem(): TreeItem | Promise<TreeItem> {
        if (this.symbolInfo) {
            const parentData = <ITypeRootNodeData>this._prarent.nodeData;
            if (parentData && parentData.symbolTree) {
                this._children = parentData.symbolTree.get(this.symbolInfo.name);
            }
            const item = new TreeItem(this.symbolInfo.name,
                (this._children && this._children.length) ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None);
            item.iconPath = this.iconPath;
            item.command = this.command;
            return item;
        }
    }

    private get iconPath(): any {
        if (SymbolNode._iconMap.has(this.symbolInfo.kind)) {
            const iconFileName = SymbolNode._iconMap.get(this.symbolInfo.kind);
            return {
                light: Services.context.asAbsolutePath(`./images/symbols/${iconFileName}_16x.svg`),
                dark: Services.context.asAbsolutePath(`./images/symbols/${iconFileName}_inverse_16x.svg`),
            };
        }
    }

    protected get command(): Command {
        return {
            title: "Go to outline",
            command: Commands.VIEW_PACKAGE_OUTLINE,
            arguments: [this._prarent.uri, this.symbolInfo.location.range],
        };
    }
}
