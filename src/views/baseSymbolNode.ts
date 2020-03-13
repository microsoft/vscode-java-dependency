// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Command, DocumentSymbol, Range, SymbolInformation, SymbolKind, ThemeIcon } from "vscode";
import { Commands } from "../commands";
import { Services } from "../services";
import { ExplorerNode } from "./explorerNode";
import { PrimaryTypeNode } from "./PrimaryTypeNode";

export abstract class BaseSymbolNode extends ExplorerNode {

    private static _iconMap: Map<SymbolKind, string> = new Map([
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

    constructor(public readonly symbolInfo: SymbolInformation | DocumentSymbol, parent: PrimaryTypeNode) {
        super(parent);
    }

    protected get iconPath(): ThemeIcon {
        if (BaseSymbolNode._iconMap.has(this.symbolInfo.kind)) {
            const symbolKind = BaseSymbolNode._iconMap.get(this.symbolInfo.kind);
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

    protected abstract get range(): Range;
}
