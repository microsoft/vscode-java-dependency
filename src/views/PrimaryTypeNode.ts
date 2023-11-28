// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Command, commands, DocumentSymbol, SymbolInformation, SymbolKind, TextDocument, ThemeIcon, Uri, workspace } from "vscode";
import { createUuid, sendOperationEnd, sendOperationStart } from "vscode-extension-telemetry-wrapper";
import { Commands } from "../commands";
import { Explorer } from "../constants";
import { INodeData, TypeKind } from "../java/nodeData";
import { Settings } from "../settings";
import { isTest } from "../utility";
import { DataNode } from "./dataNode";
import { DocumentSymbolNode } from "./documentSymbolNode";
import { ExplorerNode } from "./explorerNode";
import { ProjectNode } from "./projectNode";

export class PrimaryTypeNode extends DataNode {

    public static K_TYPE_KIND = "TypeKind";

    constructor(nodeData: INodeData, parent: DataNode, protected _rootNode?: DataNode) {
        super(nodeData, parent);
    }

    public getPackageRootPath(): string {
        if (this._rootNode?.uri) {
            return Uri.parse(this._rootNode.uri).fsPath;
        }

        const unmanagedFolder = this.getUnmanagedFolderAncestor();
        if (unmanagedFolder?.uri) {
            return Uri.parse(unmanagedFolder.uri).fsPath;
        }

        return "";
    }

    protected async loadData(): Promise<SymbolInformation[] | DocumentSymbol[] | undefined> {
        if (!this.hasChildren() || !this.nodeData.uri) {
            return undefined;
        }

        return workspace.openTextDocument(Uri.parse(this.nodeData.uri)).then((doc) => {
            return this.getSymbols(doc);
        });
    }

    protected createChildNodeList(): ExplorerNode[] {
        const result: ExplorerNode[] = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            for (const child of this.nodeData.children) {
                const documentSymbol: DocumentSymbol = child as DocumentSymbol;
                // Do not show the package declaration
                if (documentSymbol.kind === SymbolKind.Package) {
                    continue;
                }
                if (documentSymbol.name === this.nodeData.name) {
                    for (const childSymbol of documentSymbol.children) {
                        result.push(new DocumentSymbolNode(childSymbol, this));
                    }
                }
            }
        }
        return result;
    }

    protected get iconPath(): string | ThemeIcon {
        switch (this.nodeData.metaData?.[PrimaryTypeNode.K_TYPE_KIND]) {
            case TypeKind.Enum:
                return new ThemeIcon("symbol-enum");
            case TypeKind.Interface:
                return new ThemeIcon("symbol-interface");
            default:
                return new ThemeIcon("symbol-class");
        }
    }

    protected hasChildren(): boolean {
        return Settings.showMembers();
    }

    private async getSymbols(document: TextDocument): Promise<SymbolInformation[] | DocumentSymbol[] | undefined> {
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

    protected get command(): Command {
        return {
            title: "Open source file content",
            command: Commands.VSCODE_OPEN,
            arguments: [Uri.parse(this.uri || ""), { preserveFocus: true }],
        };
    }

    protected get contextValue(): string {
        let contextValue: string = Explorer.ContextValueType.Type;
        const type = this.nodeData.metaData?.[PrimaryTypeNode.K_TYPE_KIND];

        if (type === TypeKind.Enum) {
            contextValue += "+enum";
        } else if (type === TypeKind.Interface) {
            contextValue += "+interface";
        } else {
            contextValue += "+class";
        }

        if (isTest(this._rootNode?.nodeData)) {
            contextValue += "+test";
        }

        if (this._rootNode?.getParent() instanceof ProjectNode
            && (this._rootNode.getParent() as ProjectNode).nodeData?.metaData?.MaxSourceVersion >= 14) {
            contextValue += "+allowRecord";
        }

        return contextValue;
    }

    /**
     * @returns ProjectNode if the current node is under an unmanaged folder,
     * otherwise undefined.
     */
    private getUnmanagedFolderAncestor(): ProjectNode | undefined {
        let ancestor = this.getParent();
        while (ancestor && !(ancestor instanceof ProjectNode)) {
            ancestor = ancestor.getParent();
        }
        if (ancestor?.isUnmanagedFolder()) {
            return ancestor;
        }

        return undefined;
    }
}
