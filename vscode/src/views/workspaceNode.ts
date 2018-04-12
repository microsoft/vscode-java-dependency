import { DataNode } from "./dataNode";
import { INodeData, NodeKind } from "../java/nodeData";
import { ExplorerNode } from "./explorerNode";
import { Jdtls } from "../java/jdtls";
import { TreeItem, TreeItemCollapsibleState } from "vscode";
import { ProjectNode } from "./projectNode";

export class WorkspaceNode extends DataNode {
    constructor(nodeData: INodeData) {
        super(nodeData);
    }

    protected loadData(): Thenable<INodeData[]> {
        return Jdtls.getProjects(this.nodeData.uri);
    }

    protected createChildNodeList(): ExplorerNode[] {
        const result = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.nodeData.children.forEach((nodeData) => {
                result.push(new ProjectNode(nodeData));
            });
        }
        return result;
    }
}
