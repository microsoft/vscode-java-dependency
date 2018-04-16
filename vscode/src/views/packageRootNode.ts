import { DataNode } from "./dataNode";
import { INodeData, NodeKind } from "../java/nodeData";
import { Jdtls } from "../java/jdtls";
import { ExplorerNode } from "./explorerNode";
import { TypeRootNode } from "./typeRootNode";
import { FolderNode } from "./folderNode";
import { FileNode } from "./fileNode";
import { PackageNode } from "./packageNode";
import { ProjectNode } from "./projectNode";
import { IPackageRootNodeData, PackageRootKind } from "../java/packageRootNodeData";
import { IContainerNodeData } from "../java/containerNodeData";

export class PackageRootNode extends DataNode {

    constructor(nodeData: INodeData, private _project: ProjectNode) {
        super(nodeData);
    }

    protected loadData(): Thenable<INodeData[]> {
        return Jdtls.getPackageData({ kind: NodeKind.PackageRoot, projectUri: this._project.nodeData.uri, rootPath: this.nodeData.path });
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
                } else if (data.kind === NodeKind.TypeRoot) {
                    result.push(new TypeRootNode(data));
                }
            });
        }
        return result;
    }

    protected get iconPath(): string {
        const data = <IPackageRootNodeData>this.nodeData;
        if (data.entryKind === PackageRootKind.K_BINARY) {
            return "./images/jar_src.png";
        } else {
            return "./images/packagefolder.png";
        }
    }
}