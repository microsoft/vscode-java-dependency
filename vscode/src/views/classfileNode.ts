import { INodeData } from "../java/nodeData";
import { ExplorerNode } from "./explorerNode";
import { DataNode } from "./dataNode";

export class ClassfileNode extends DataNode {
    constructor(nodeData: INodeData) {
        super(nodeData);
    }

    protected loadData(): Thenable<INodeData[]> {
        return null;
    }

    protected createChildNodeList(): ExplorerNode[] {
        return null;
    }
}