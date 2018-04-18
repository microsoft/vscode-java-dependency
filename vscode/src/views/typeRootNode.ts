import { Command, commands, SymbolInformation, TextDocument, Uri, workspace } from "vscode";
import { Commands } from "../commands";
import { INodeData } from "../java/nodeData";
import { ITypeRootNodeData, TypeRootKind } from "../java/typeRootNodeData";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { SymbolNode } from "./symbolNode";

export class TypeRootNode extends DataNode {
    constructor(nodeData: INodeData) {
        super(nodeData);
    }

    protected loadData(): Thenable<SymbolInformation[]> {
        return workspace.openTextDocument(Uri.parse(this.nodeData.uri)).then((doc) => {
            return this.getSymbols(doc);
        });
    }

    protected createChildNodeList(): ExplorerNode[] {
        const data = <ITypeRootNodeData>this.nodeData;
        const result: ExplorerNode[] = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            data.symbolTree = this.buildSymbolTree(this.nodeData.children);
            const directChildren = data.symbolTree.get(this.nodeData.name);
            if (directChildren && directChildren.length) {
                directChildren.forEach((symbolInfo) => {
                    result.push(new SymbolNode(symbolInfo, this));
                });
            }
        }
        return result;
    }

    protected get iconPath(): string {
        const data = <ITypeRootNodeData>this.nodeData;
        if (data.entryKind === TypeRootKind.K_BINARY) {
            return "./images/classfile.png";
        } else {
            return "./images/file_type_java.svg";
        }
    }

    private getSymbols(document: TextDocument): Thenable<SymbolInformation[]> {
        return commands.executeCommand<SymbolInformation[]>(
            "vscode.executeDocumentSymbolProvider",
            document.uri,
        );
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
