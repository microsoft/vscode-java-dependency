import { Jdtls } from "../java/jdtls";
import { INodeData, NodeKind } from "../java/nodeData";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { FileNode } from "./fileNode";
import { ProjectNode } from "./projectNode";

export class FolderNode extends DataNode {
    constructor(nodeData: INodeData, private _project: ProjectNode, private _rootNode: DataNode) {
        super(nodeData);
    }

    protected loadData(): Thenable<INodeData[]> {
        return Jdtls.getPackageData({ kind: NodeKind.Folder, projectUri: this._project.uri, path: this.path, rootPath: this._rootNode.path });
    }

    protected createChildNodeList(): ExplorerNode[] {
        const result = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.nodeData.children.forEach((nodeData) => {
                if (nodeData.kind === NodeKind.File) {
                    result.push(new FileNode(nodeData));
                } else if (nodeData.kind === NodeKind.Folder) {
                    result.push(new FolderNode(nodeData, this._project, this._rootNode));
                }
            });
        }
        return result;
    }

    protected get iconPath(): string {
        return "./images/folder.png";
    }
}
