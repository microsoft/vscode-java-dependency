// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import { TreeItem, TreeItemCollapsibleState } from "vscode";
import { HierarchicalPackageNodeData } from "../java/hierarchicalPackageNodeData";
import { INodeData } from "../java/nodeData";
import { explorerLock } from "../utils/Lock";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { PackageNode } from "./packageNode";
import { ProjectNode } from "./projectNode";
import { NodeFactory } from "./nodeFactory";

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
            await explorerLock.acquireAsync();
            const data = await this.loadData();
            if (data) {
                if (this.nodeData?.children) {
                    this.nodeData.children.push(...data);
                    this.nodeData.children = _.uniqBy(this.nodeData.children, (child: INodeData) => [child.path, child.name].join());
                } else {
                    this.nodeData.children = data;
                }
            }
            this._childrenNodes = this.createChildNodeList() || [];
            this.sort();
            return this._childrenNodes;
        } finally {
            explorerLock.release();
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
        const result: (ExplorerNode | undefined)[] = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.nodeData.children.forEach((nodeData) => {
                result.push(NodeFactory.createNode(nodeData, this, this._project, this._rootNode));
            });
        }
        return result.filter(<T>(n?: T): n is T => Boolean(n));
    }

    private getHierarchicalNodeData(): HierarchicalPackageNodeData {
        return <HierarchicalPackageNodeData>this.nodeData;
    }
}
