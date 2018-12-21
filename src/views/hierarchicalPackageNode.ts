// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ProviderResult, TreeItem, TreeItemCollapsibleState } from "vscode";
import { HierarchicalPackageNodeData } from "../java/hierarchicalPackageNodeData";
import { INodeData, NodeKind } from "../java/nodeData";
import { Telemetry } from "../telemetry";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { FileNode } from "./fileNode";
import { PackageNode } from "./packageNode";
import { ProjectNode } from "./projectNode";
import { TypeRootNode } from "./typeRootNode";

export class HierarchicalPackageNode extends PackageNode {

    constructor(nodeData: INodeData, parent: DataNode, protected _project: ProjectNode, protected _rootNode: DataNode) {
        super(nodeData, parent, _project, _rootNode);
    }

    public getTreeItem(): TreeItem | Promise<TreeItem> {
        if (this._nodeData) {
            const item = new TreeItem(this.getHierarchicalNodeData().displayName,
                this.hasChildren() ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None);
            item.iconPath = this.iconPath;
            item.command = this.command;
            return item;
        }
    }

    public getChildren(): ProviderResult<ExplorerNode[]> {
        return this.loadData().then((res) => {
            if (!res) {
                Telemetry.sendEvent("load data get undefined result", { node_kind: this.nodeData.kind.toString() });
            } else {
                // Combine hierarchical children and normal package node children
                res.forEach((node) => this.nodeData.children.push(node));
            }
            return this.createChildNodeList();
        });
    }

    public async revealPaths(paths: INodeData[]): Promise<DataNode> {
        const hierarchicalNodeData = paths[0];
        if (hierarchicalNodeData.name === this.nodeData.name) {
            paths.shift();
            // reveal as a package node
            return super.revealPaths(paths);
        } else {
            const children: ExplorerNode[] = await this.getChildren();
            const childNode = <DataNode>children.find((child: DataNode) =>
                hierarchicalNodeData.name.startsWith(child.nodeData.name + ".") || hierarchicalNodeData.name === child.nodeData.name);
            return childNode ? childNode.revealPaths(paths) : null;
        }
    }

    protected loadData(): Thenable<any[]> {
        // Load data only when current node is a package
        return this.getHierarchicalNodeData().isPackage ? super.loadData() : Promise.resolve([]);
    }

    protected createChildNodeList(): ExplorerNode[] {
        const result = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.sort();
            this.nodeData.children.forEach((nodeData) => {
                if (nodeData.kind === NodeKind.File) {
                    result.push(new FileNode(nodeData, this));
                } else if (nodeData instanceof HierarchicalPackageNodeData) {
                    result.push(new HierarchicalPackageNode(nodeData, this, this._project, this._rootNode));
                } else {
                    result.push(new TypeRootNode(nodeData, this));
                }
            });
        }
        return result;
    }

    private getHierarchicalNodeData(): HierarchicalPackageNodeData {
        return <HierarchicalPackageNodeData>this.nodeData;
    }
}
