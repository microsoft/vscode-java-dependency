import { TreeItem, ProviderResult } from "vscode";
import { INodeData } from "../java/nodeData";

export abstract class ExplorerNode {
    constructor() {
    }

    abstract getChildren(): ProviderResult<ExplorerNode[]>;

    abstract getTreeItem(): TreeItem | Promise<TreeItem>;
}