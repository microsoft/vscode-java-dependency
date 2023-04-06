// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { HierarchicalPackageNodeData } from "../java/hierarchicalPackageNodeData";
import { INodeData, NodeKind } from "../java/nodeData";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { HierarchicalPackageNode } from "./hierarchicalPackageNode";
import { NodeFactory } from "./nodeFactory";
import { PackageRootNode } from "./packageRootNode";
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
        const result: (ExplorerNode | undefined)[] = [];
        const packageData: any[] = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.nodeData.children.forEach((nodeData) => {
                if (nodeData.kind === NodeKind.Package) {
                    // Invisible project may have an empty named package root (the linked folder),
                    // in that case, we will skip it.
                    packageData.push(nodeData);
                } else {
                    result.push(NodeFactory.createNode(nodeData, this, this._project, this));
                }
            });
        }

        if (packageData.length > 0) {
            const data: HierarchicalPackageNodeData = HierarchicalPackageNodeData.createHierarchicalNodeDataByPackageList(packageData);
            if (data) {
                result.push(...data.children.map(d => NodeFactory.createNode(d, this, this._project, this)));
            }
        }

        return result.filter(<T>(n?: T): n is T => Boolean(n));
    }
}
