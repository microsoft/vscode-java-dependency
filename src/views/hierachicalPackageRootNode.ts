// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { INodeData, NodeKind } from "../java/nodeData";
import { PackageTreeNode } from "../java/packageTreeNode";
import { Settings } from "../settings";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { FileNode } from "./fileNode";
import { FolderNode } from "./folderNode";
import { HierachicalPackageRootSubNode } from "./hierachicalPackageRootSubNode";
import { PackageRootNode } from "./packageRootNode";
import { ProjectNode } from "./projectNode";
import { TypeRootNode } from "./typeRootNode";

export class HierachicalPackageRootNode extends PackageRootNode {

    constructor(nodeData: INodeData, parent: DataNode, _project: ProjectNode) {
        super(nodeData, parent, _project);
    }

    public async getCorrespondChildNodeWithNodeData(nodeData: INodeData): Promise<DataNode> {
        let result: HierachicalPackageRootSubNode = null;
        do {
            const child: ExplorerNode[] = result ? await result.getChildren() : await this.getChildren();
            result = <HierachicalPackageRootSubNode>child.find((node) => node instanceof HierachicalPackageRootSubNode
                && nodeData.name.startsWith(node.fullName));
        } while (result && result.fullName !== nodeData.name);
        return result;
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
        const packageTree = this.getPackageTree();
        packageTree.childs.forEach((childNode) => {
            result.push(new HierachicalPackageRootSubNode(childNode.getNodeDataFromPackageTreeNode(this.nodeData), this, this._project, childNode));
        });
        return result;
    }

    private getPackageTree(): PackageTreeNode {
        const result: PackageTreeNode = new PackageTreeNode("", "");
        if (this.nodeData.children && this.nodeData.children.length) {
            this.nodeData.children.forEach((child) => {
                if (child.kind === NodeKind.Package) {
                    result.addPackage(child.name);
                }
            });
        }
        result.compressTree();
        return result;
    }
}
