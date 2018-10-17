// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Command, DocumentSymbol, Range, SymbolInformation, SymbolKind } from "vscode";
import { Commands } from "../commands";
import { Services } from "../services";
import { ExplorerNode } from "./explorerNode";
import { TypeRootNode } from "./typeRootNode";

export abstract class BaseSymbolNode extends ExplorerNode {

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

    constructor(public readonly symbolInfo: SymbolInformation | DocumentSymbol, private parent: TypeRootNode) {
        super(parent);
    }

    protected get iconPath(): any {
        if (BaseSymbolNode._iconMap.has(this.symbolInfo.kind)) {
            const iconFileName = BaseSymbolNode._iconMap.get(this.symbolInfo.kind);
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
            arguments: [(this.getParent() as TypeRootNode).uri, this.range],
        };
    }

    protected abstract get range(): Range;
}
