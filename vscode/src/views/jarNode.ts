import { DataNode } from "./dataNode";
import { INodeData, NodeKind } from "../java/nodeData";
import { Jdtls } from "../java/jdtls";
import { ExplorerNode } from "./explorerNode";
import { ClassfileNode } from "./classfileNode";
import { FolderNode } from "./folderNode";
import { FileNode } from "./fileNode";
import { PackageNode } from "./packageNode";
import { ProjectNode } from "./projectNode";

export class JarNode extends DataNode {
    constructor(nodeData: INodeData, private _project: ProjectNode) {
        super(nodeData);
    }

    protected loadData(): Thenable<INodeData[]> {
        return Jdtls.getPackageData({ kind: NodeKind.Jar, projectUri: this._project.nodeData.uri, rootPath: this.nodeData.path });
    }

    protected createChildNodeList(): ExplorerNode[] {
        const result = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.nodeData.children.forEach((data) => {
                if (data.kind === NodeKind.Package) {
                    result.push(new PackageNode(data, this._project, this));
                } else if (data.kind === NodeKind.File) {
                    result.push(new FileNode(data));
                } else if (data.kind === NodeKind.Folder) {
                    result.push(new FolderNode(data, this._project, this));
                } else if (data.kind === NodeKind.Classfile) {
                    result.push(new ClassfileNode(data));
                }
            });
        }
        return result;
    }
}