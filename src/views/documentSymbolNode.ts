// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Command, DocumentSymbol, SymbolInformation, SymbolKind, TreeItem, TreeItemCollapsibleState } from "vscode";
import { Commands } from "../commands";
import { ITypeRootNodeData } from "../java/typeRootNodeData";
import { Services } from "../services";
import { ExplorerNode } from "./explorerNode";
import { TypeRootNode } from "./typeRootNode";

export class DocumentSymbolNode extends ExplorerNode {
    private static _iconMap: Map<SymbolKind, string> = new Map([
        [SymbolKind.Package, "Namespace"],
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

    constructor(public readonly symbolInfo: DocumentSymbol, private parent: TypeRootNode) {
        super(parent);
    }

    public getChildren(): ExplorerNode[] | Thenable<ExplorerNode[]> {
        const res: ExplorerNode[] = [];
        if (this.symbolInfo && this.symbolInfo.children && this.symbolInfo.children.length) {
            this.symbolInfo.children.forEach((child) => {
                res.push(new DocumentSymbolNode(child, this.getParent() as TypeRootNode));
            });
        }
        return res;
    }

    public getTreeItem(): TreeItem | Promise<TreeItem> {
        if (this.symbolInfo) {
            const item = new TreeItem(this.symbolInfo.name,
                (this.symbolInfo.children && this.symbolInfo.children.length) ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None);
            item.iconPath = this.iconPath;
            item.command = this.command;
            return item;
        }
    }

    private get iconPath(): any {
        if (DocumentSymbolNode._iconMap.has(this.symbolInfo.kind)) {
            const iconFileName = DocumentSymbolNode._iconMap.get(this.symbolInfo.kind);
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
            arguments: [(this.getParent() as TypeRootNode).uri, this.symbolInfo.range],
        };
    }
}
