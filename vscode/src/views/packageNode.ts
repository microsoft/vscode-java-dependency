
import { ExplorerNode } from "./explorerNode";
import { INodeData, NodeKind } from "../java/nodeData";
import { DataNode } from "./dataNode";
import { ProjectNode } from "./projectNode";
import { Jdtls } from "../java/jdtls";
import { TypeRootNode } from "./typeRootNode";

export class PackageNode extends DataNode {
    constructor(nodeData: INodeData, private _project: DataNode, private _rootNode: DataNode) {
        super(nodeData);
    }

    protected loadData(): Thenable<INodeData[]> {
        return Jdtls.getPackageData({ kind: NodeKind.Package, projectUri: this._project.nodeData.uri, path: this.nodeData.name, rootPath: this._rootNode.path });
    }

    protected createChildNodeList(): ExplorerNode[] {
        const result = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.nodeData.children.forEach((nodeData) => {
                result.push(new TypeRootNode(nodeData));
            });
        }
        return result;
    }

    protected get iconPath(): string {
        return "./images/package.png";
    }
}
