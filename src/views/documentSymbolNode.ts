// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Command, DocumentSymbol, Range, SymbolKind, ThemeIcon, TreeItem, TreeItemCollapsibleState } from "vscode";
import { Commands } from "../commands";
import { Explorer } from "../constants";
import { ExplorerNode } from "./explorerNode";
import { PrimaryTypeNode } from "./PrimaryTypeNode";

export class DocumentSymbolNode extends ExplorerNode {

    private readonly _iconMap: Map<SymbolKind, string> = new Map([
        [SymbolKind.Package, "package"],
        [SymbolKind.Class, "class"],
        [SymbolKind.Interface, "interface"],
        [SymbolKind.Enum, "enum"],
        [SymbolKind.EnumMember, "enum-member"],
        [SymbolKind.Constant, "constant"],
        [SymbolKind.Method, "method"],
        [SymbolKind.Function, "method"],
        [SymbolKind.Constructor, "method"],
        [SymbolKind.Field, "field"],
        [SymbolKind.Property, "property"],
        [SymbolKind.Variable, "variable"],
    ]);

    constructor(private readonly symbolInfo: DocumentSymbol, parent: PrimaryTypeNode) {
        super(parent);
    }

    public getChildren(): ExplorerNode[] | Promise<ExplorerNode[]> {
        const res: ExplorerNode[] = [];
        if (this.symbolInfo?.children?.length) {
            this.symbolInfo.children.forEach((child) => {
                res.push(new DocumentSymbolNode(child, this.getParent() as PrimaryTypeNode));
            });
        }
        return res;
    }

    public getTreeItem(): TreeItem | Promise<TreeItem> {
        const item = new TreeItem(this.symbolInfo.name,
            this.symbolInfo?.children?.length ? TreeItemCollapsibleState.Collapsed
                : TreeItemCollapsibleState.None);
        item.iconPath = this.iconPath;
        item.command = this.command;
        return item;
    }

    public get range(): Range {
        // Using `selectionRange` instead of `range` to make sure the cursor will be pointing to the codes, not the comments
        return this.symbolInfo.selectionRange;
    }

    public computeContextValue(): string | undefined {
        return `java:${Explorer.ContextValueType.Symbol}`;
    }

    protected get iconPath(): ThemeIcon {
        if (this._iconMap.has(this.symbolInfo.kind)) {
            const symbolKind = this._iconMap.get(this.symbolInfo.kind);
            return new ThemeIcon(`symbol-${symbolKind}`);
        }
        return new ThemeIcon("symbol-misc");
    }

    protected get command(): Command {
        return {
            title: "Go to outline",
            command: Commands.VIEW_PACKAGE_OUTLINE,
            arguments: [(this.getParent() as PrimaryTypeNode).uri, this.range],
        };
    }
}
