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

    public static async convertPaths(paths: INodeData[]): Promise<INodeData[]> {
        const index = paths.findIndex((nodeData) => nodeData.kind === NodeKind.PackageRoot);
        const projectNodeData = paths.find((nodeData) => nodeData.kind === NodeKind.Project);
        const packageRootNodeData = paths[index];
        const packageNodeData = paths[index + 1];
        const packageRootNode = new HierachicalPackageRootNode(packageRootNodeData, null, new ProjectNode(projectNodeData, null));

        const correspondDataNodes: INodeData[] = [];
        let correspondNode = await packageRootNode.revealPath(packageNodeData);
        while (correspondNode instanceof HierachicalPackageRootSubNode) {
            correspondDataNodes.push({
                name: correspondNode.nodeData.name,
                moduleName: null,
                path: correspondNode.nodeData.path,
                uri: null,
                kind: NodeKind.PackageRoot,
                children: null,
            });
            correspondNode = correspondNode.getParent();
        }
        const result = paths.slice(null, index + 1).concat(correspondDataNodes.reverse(), paths.slice(index + 2));
        return result;
    }

    constructor(nodeData: INodeData, parent: DataNode, _project: ProjectNode) {
        super(nodeData, parent, _project);
    }

    public async revealPath(packageNodeData: INodeData): Promise<ExplorerNode> {
        await this.getChildren();
        let packageTreeNode: PackageTreeNode = this.getPackageTree();
        let result: DataNode = null;
        while (packageTreeNode && packageTreeNode.fullName !== packageNodeData.name) {
            packageTreeNode = packageTreeNode.childs.find((child) => packageNodeData.name.startsWith(child.fullName));
            result = packageTreeNode ? new HierachicalPackageRootSubNode(packageTreeNode.getNodeDataFromPackageTreeNode(this.nodeData),
                result, this._project, packageTreeNode) : null;
        }
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
