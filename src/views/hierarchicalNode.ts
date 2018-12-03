import { INodeData } from "../java/nodeData";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";

export abstract class HierarchicalNode extends DataNode {
    public abstract createFlatChildNodeList(): ExplorerNode[];
    public abstract createHierarchicalChildNodeList(): ExplorerNode[];
    public abstract isHierarchicalView(): boolean;
    public abstract revealPath(paths: INodeData[]): Promise<[ExplorerNode, INodeData[]]>;

    protected createChildNodeList(): ExplorerNode[] {
        if (this.isHierarchicalView()) {
            return this.createHierarchicalChildNodeList();
        } else {
            return this.createFlatChildNodeList();
        }
    }
}
