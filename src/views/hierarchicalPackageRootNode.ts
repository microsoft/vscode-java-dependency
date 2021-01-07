// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { HierarchicalPackageNodeData } from "../java/hierarchicalPackageNodeData";
import { INodeData, NodeKind } from "../java/nodeData";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { FileNode } from "./fileNode";
import { FolderNode } from "./folderNode";
import { HierarchicalPackageNode } from "./hierarchicalPackageNode";
import { PackageRootNode } from "./packageRootNode";
import { PrimaryTypeNode } from "./PrimaryTypeNode";
import { ProjectNode } from "./projectNode";

export class HierarchicalPackageRootNode extends PackageRootNode {

    constructor(nodeData: INodeData, parent: DataNode, _project: ProjectNode) {
        super(nodeData, parent, _project);
    }

    public async revealPaths(paths: INodeData[]): Promise<DataNode | undefined> {
        const hierarchicalNodeData = paths[0];
        const children: ExplorerNode[] = await this.getChildren();
        const childNode = <DataNode>children.find((child: DataNode) =>
            hierarchicalNodeData.name.startsWith(child.nodeData.name + ".") || hierarchicalNodeData.name === child.nodeData.name);
        // don't shift when child node is an hierarchical node, or it may lose data of package node
        if (!(childNode instanceof HierarchicalPackageNode)) {
            paths.shift();
        }
        return (childNode && paths.length > 0) ? childNode.revealPaths(paths) : childNode;
    }

    protected createChildNodeList(): ExplorerNode[] {
        const result: ExplorerNode[] = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.sort();
            this.nodeData.children.forEach((data) => {
                if (data.kind === NodeKind.File) {
                    result.push(new FileNode(data, this));
                } else if (data.kind === NodeKind.Folder) {
                    result.push(new FolderNode(data, this, this._project, this));
                } else if (data.kind === NodeKind.PrimaryType) {
                    if (data.metaData && data.metaData[PrimaryTypeNode.K_TYPE_KIND]) {
                        result.push(new PrimaryTypeNode(data, this, this));
                    }
                }
            });
        }
        return result.concat(this.getHierarchicalPackageNodes());
    }

    protected getHierarchicalPackageNodes(): ExplorerNode[] {
        const hierarchicalPackageNodeData = this.getHierarchicalPackageNodeData();
        return hierarchicalPackageNodeData?.children.map((hierarchicalChildrenNode) =>
            new HierarchicalPackageNode(hierarchicalChildrenNode, this, this._project, this)) || [];
    }

    private getHierarchicalPackageNodeData(): HierarchicalPackageNodeData  | undefined {
        if (this.nodeData.children && this.nodeData.children.length) {
            const nodeDataList = this.nodeData.children
                .filter((child) => child.kind === NodeKind.Package);
            return HierarchicalPackageNodeData.createHierarchicalNodeDataByPackageList(nodeDataList);
        }
        return undefined;
    }
}
