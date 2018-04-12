import { DataNode } from "./dataNode";
import { INodeData, NodeKind } from "../java/nodeData";
import { ExplorerNode } from "./explorerNode";
import { Jdtls } from "../java/jdtls";
import { JarNode } from "./jarNode";
import { ProjectNode } from "./projectNode";

export class SrcContainerNode extends DataNode {
    constructor(nodeData: INodeData, private readonly _project: ProjectNode) {
        super(nodeData);
    }

    protected loadData(): Thenable<INodeData[]> {
        return Jdtls.getPackageData({ kind: NodeKind.Container, projectUri: this._project.uri, path: this.path });
    }
    protected createChildNodeList(): ExplorerNode[] {
        const result = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.nodeData.children.forEach((classpathNode) => {
                result.push(new JarNode(classpathNode, this._project));
            });
        }
        return result;
    }
}
