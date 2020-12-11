// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import { TreeItem, TreeItemCollapsibleState } from "vscode";
import { HierarchicalPackageNodeData } from "../java/hierarchicalPackageNodeData";
import { INodeData, NodeKind } from "../java/nodeData";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { FileNode } from "./fileNode";
import { PackageNode } from "./packageNode";
import { PrimaryTypeNode } from "./PrimaryTypeNode";
import { ProjectNode } from "./projectNode";

export class HierarchicalPackageNode extends PackageNode {

    constructor(nodeData: INodeData, parent: DataNode, protected _project: ProjectNode, protected _rootNode: DataNode) {
        super(nodeData, parent, _project, _rootNode);
    }

    public getTreeItem(): TreeItem | Promise<TreeItem> {
        const item = new TreeItem(this.getHierarchicalNodeData().displayName,
                this.hasChildren() ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None);
        return { ...super.getTreeItem(), ...item };
    }

    public async getChildren(): Promise<ExplorerNode[]> {
        try {
            await this._lock.acquire();
            const data = await this.loadData();
            if (data) {
                if (this.nodeData?.children) {
                    this.nodeData.children.push(...data);
                    this.nodeData.children = _.uniqBy(this.nodeData.children, (child: INodeData) => [child.path, child.name].join());
                } else {
                    this.nodeData.children = data;
                }
            }
            return this.createChildNodeList();
        } finally {
            this._lock.release();
        }
    }

    public async revealPaths(paths: INodeData[]): Promise<DataNode | undefined> {
        const hierarchicalNodeData = paths[0];
        if (hierarchicalNodeData.name === this.nodeData.name) {
            paths.shift();
            // reveal as a package node
            return super.revealPaths(paths);
        } else {
            const children: ExplorerNode[] = await this.getChildren();
            const childNode = <DataNode>children.find((child: DataNode) =>
                hierarchicalNodeData.name.startsWith(child.nodeData.name + ".") || hierarchicalNodeData.name === child.nodeData.name);
            return childNode ? childNode.revealPaths(paths) : undefined;
        }
    }

    protected async loadData(): Promise<any[]> {
        // Load data only when current node is a package
        return this.getHierarchicalNodeData().isPackage ? super.loadData() : [];
    }

    protected createChildNodeList(): ExplorerNode[] {
        const result: ExplorerNode[] = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.sort();
            this.nodeData.children.forEach((nodeData) => {
                if (nodeData.kind === NodeKind.File) {
                    result.push(new FileNode(nodeData, this));
                } else if (nodeData instanceof HierarchicalPackageNodeData) {
                    result.push(new HierarchicalPackageNode(nodeData, this, this._project, this._rootNode));
                } else if (nodeData.kind === NodeKind.PrimaryType) {
                    if (nodeData.metaData && nodeData.metaData[PrimaryTypeNode.K_TYPE_KIND]) {
                        result.push(new PrimaryTypeNode(nodeData, this));
                    }
                }
            });
        }
        return result;
    }

    private getHierarchicalNodeData(): HierarchicalPackageNodeData {
        return <HierarchicalPackageNodeData>this.nodeData;
    }
}
