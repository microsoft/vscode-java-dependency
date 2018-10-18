// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Command, commands, DocumentSymbol, SymbolInformation, TextDocument, ThemeIcon, Uri, workspace } from "vscode";
import { createUuid, sendOperationEnd, sendOperationStart } from "vscode-extension-telemetry-wrapper";
import { Commands } from "../commands";
import { INodeData } from "../java/nodeData";
import { ITypeRootNodeData, TypeRootKind } from "../java/typeRootNodeData";
import { Services } from "../services";
import { Settings } from "../settings";
import { DataNode } from "./dataNode";
import { DocumentSymbolNode } from "./documentSymbolNode";
import { ExplorerNode } from "./explorerNode";
import { SymbolNode } from "./symbolNode";

export class TypeRootNode extends DataNode {
    constructor(nodeData: INodeData, parent: DataNode) {
        super(nodeData, parent);
    }

    protected loadData(): Thenable<SymbolInformation[] | DocumentSymbol[]> {
        return workspace.openTextDocument(Uri.parse(this.nodeData.uri)).then((doc) => {
            return this.getSymbols(doc);
        });
    }

    protected createChildNodeList(): ExplorerNode[] {
        const data = <ITypeRootNodeData>this.nodeData;
        const result: ExplorerNode[] = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            // After DocumentSymbolProvider api change at
            // https://github.com/eclipse/eclipse.jdt.ls/issues/780, the vscode.executeDocumentSymbolProvider
            // will return DocumentSymbol[]
            if (this.nodeData.children && this.nodeData.children.length && this.nodeData.children[0].hasOwnProperty("children")) {
                // if the element in children is DocumentSymbol
                this.nodeData.children.forEach((symbolInfo: DocumentSymbol) => {
                    result.push(new DocumentSymbolNode(symbolInfo, this));
                });
            } else {
                // if the element in children is SymbolInformation
                data.symbolTree = this.buildSymbolTree(this.nodeData.children);
                const directChildren = data.symbolTree.get(this.nodeData.name);
                if (directChildren && directChildren.length) {
                    directChildren.forEach((symbolInfo) => {
                        result.push(new SymbolNode(symbolInfo, this));
                    });
                }
            }

        }
        return result;
    }

    protected get iconPath(): string | ThemeIcon {
        const data = <ITypeRootNodeData>this.nodeData;
        if (data.entryKind === TypeRootKind.K_BINARY) {
            return ExplorerNode.resolveIconPath("classfile");
        } else {
            return Services.context.asAbsolutePath("./images/file-type-java.svg");
        }
    }
    protected hasChildren(): boolean {
        return Settings.showOutline();
    }

    private async getSymbols(document: TextDocument): Promise<SymbolInformation[] | DocumentSymbol[]> {
        let error;
        const operationId = createUuid();
        const startAt: number = Date.now();
        sendOperationStart(operationId, "vscode.executeDocumentSymbolProvider");
        try {
            return await commands.executeCommand<SymbolInformation[]>(
                "vscode.executeDocumentSymbolProvider",
                document.uri,
            );
        } catch (err) {
            error = err;
            throw err;
        } finally {
            const duration = Date.now() - startAt;
            sendOperationEnd(operationId, "vscode.executeDocumentSymbolProvider", duration, error);
        }
    }

    private buildSymbolTree(symbols: SymbolInformation[]): Map<string, SymbolInformation[]> {
        const res = new Map<string, SymbolInformation[]>();

        symbols.forEach((symbol) => {
            if (!res.has(symbol.containerName)) {
                res.set(symbol.containerName, []);
            }
            res.get(symbol.containerName).push(symbol);
        });

        return res;
    }

    protected get command(): Command {
        return {
            title: "Open source file content",
            command: Commands.VIEW_PACKAGE_OPEN_FILE,
            arguments: [this.uri],
        };
    }
}
