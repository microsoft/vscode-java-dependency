// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Jdtls } from "../java/jdtls";
import { INodeData, NodeKind } from "../java/nodeData";
import { PackageTreeNode } from "../java/packageTreeNode";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { FileNode } from "./fileNode";
import { FolderNode } from "./folderNode";
import { ProjectNode } from "./projectNode";
import { TypeRootNode } from "./typeRootNode";

export class HierachicalPackageRootSubNode extends DataNode {

    public packageTree: PackageTreeNode;

    constructor(nodeData: INodeData, parent: DataNode, private _project: ProjectNode, packageTree: PackageTreeNode = null) {
        super(nodeData, parent);
        this.packageTree = packageTree;
    }

    protected loadData(): Thenable<any[]> {
        return Jdtls.getPackageData({
            kind: NodeKind.Package, projectUri: this._project.nodeData.uri, path: this.packageTree.fullName, rootPath: this.nodeData.path,
        });
    }

    protected get iconPath(): { light: string; dark: string } {
        return ExplorerNode.resolveIconPath("package");
    }

    protected createChildNodeList(): ExplorerNode[] {
        const result = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.sort();
            this.nodeData.children.forEach((data) => {
                if (data.kind === NodeKind.File) {
                    result.push(new FileNode(data, this));
                } else if (data.kind === NodeKind.Folder) {
                    result.push(new FolderNode(data, this, this._project, this));
                } else if (data.kind === NodeKind.TypeRoot) {
                    result.push(new TypeRootNode(data, this));
                }
            });
        }
        const packageNodeList = this.getHierarchicalPackageNodes();
        return packageNodeList.concat(result);
    }

    protected getHierarchicalPackageNodes(): ExplorerNode[] {
        const result = [];
        this.packageTree.childs.forEach((childNode) => {
            result.push(new HierachicalPackageRootSubNode(childNode.getNodeDataFromPackageTreeNode(this.nodeData), this, this._project, childNode));
        });
        return result;
    }
}
