import { ExplorerNode } from "./explorerNode";
import { DataNode } from "./dataNode";
import { TreeItem, TreeItemCollapsibleState } from "vscode";
import { INodeData, NodeKind } from "../java/nodeData";
import { Jdtls } from "../java/jdtls";
import { ContainerNode } from "./containerNode";

export class ProjectNode extends DataNode {

    constructor(nodeData: INodeData) {
        super(nodeData);
    }

    protected loadData(): Thenable<INodeData[]> {
        return Jdtls.getPackageData({ kind: NodeKind.Project, projectUri: this.nodeData.uri });
    }

    protected createChildNodeList(): ExplorerNode[] {

        const result = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.nodeData.children.forEach((data) => {
                result.push(new ContainerNode(data, this));
            });
        }
        return result;
    }
}