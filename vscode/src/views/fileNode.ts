import { DataNode } from "./dataNode";
import { INodeData } from "../java/nodeData";
import { ExplorerNode } from "./explorerNode";

export class FileNode extends DataNode {
    constructor(nodeData: INodeData) {
        super(nodeData);
    }

    protected loadData(): Thenable<INodeData[]> {
        return null;
    }

    protected createChildNodeList(): ExplorerNode[] {
        return null;
    }

    protected get iconPath() : string {
        return "./images/file.png";
    }
}
