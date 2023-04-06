// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import { ThemeIcon, TreeItem, TreeItemCollapsibleState, Uri } from "vscode";
import { INodeData, NodeKind } from "../java/nodeData";
import { explorerLock } from "../utils/Lock";
import { ExplorerNode } from "./explorerNode";

export abstract class DataNode extends ExplorerNode {

    protected _childrenNodes: ExplorerNode[];

    constructor(protected _nodeData: INodeData, parent?: DataNode) {
        super(parent);
    }

    public getTreeItem(): TreeItem | Promise<TreeItem> {
        const item = new TreeItem(
            this._nodeData.displayName || this._nodeData.name,
            this.hasChildren() ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None,
        );
        item.description = this.description;
        item.iconPath = this.iconPath;
        item.command = this.command;
        item.contextValue = this.computeContextValue();
        if (this.uri) {
            switch (this._nodeData.kind) {
                case NodeKind.PackageRoot:
                case NodeKind.Package:
                case NodeKind.PrimaryType:
                case NodeKind.Folder:
                case NodeKind.File:
                    item.resourceUri = Uri.parse(this.uri);
                    break;
            }
        }

        return item;
    }

    public get nodeData(): INodeData {
        return this._nodeData;
    }

    public get uri() {
        return this._nodeData.uri;
    }

    public get path() {
        return this._nodeData.path;
    }

    public get handlerIdentifier() {
        return this._nodeData.handlerIdentifier;
    }

    public get name() {
        return this._nodeData.name;
    }

    public async revealPaths(paths: INodeData[]): Promise<DataNode | undefined> {
        if (_.isEmpty(paths)) {
            return this;
        }
        const childNodeData = paths.shift();
        const children: ExplorerNode[] = await this.getChildren();
        const childNode = <DataNode>children?.find((child: DataNode) =>
            child.nodeData.name === childNodeData?.name && child.path === childNodeData?.path);
        return (childNode && paths.length) ? childNode.revealPaths(paths) : childNode;
    }

    public async getChildren(): Promise<ExplorerNode[]> {
        try {
            await explorerLock.acquireAsync();
            if (!this._nodeData.children) {
                const data = await this.loadData();
                this._nodeData.children = data;
                this._childrenNodes = this.createChildNodeList() || [];
                this.sort();
                return this._childrenNodes;
            }
            return this._childrenNodes;
        } finally {
            explorerLock.release();
        }
    }

    public computeContextValue(): string | undefined {
        let contextValue = this.contextValue;
        if (this.uri && this.uri.startsWith("file:")) {
            contextValue = `${contextValue || ""}+uri`;
        }
        if (contextValue) {
            contextValue = `java:${contextValue}`;
        }
        return contextValue;
    }

    protected sort() {
        this._childrenNodes.sort((a: ExplorerNode, b: ExplorerNode) => {
            if (a instanceof DataNode && b instanceof DataNode) {
                if (a.nodeData.kind === b.nodeData.kind) {
                    return a.nodeData.name < b.nodeData.name ? -1 : 1;
                } else {
                    return a.nodeData.kind - b.nodeData.kind;
                }
            }
            return 0;
        });
    }

    protected hasChildren(): boolean {
        return true;
    }

    protected get description(): string | boolean | undefined {
        return undefined;
    }

    protected get contextValue(): string | undefined {
        return undefined;
    }

    protected abstract get iconPath(): string | Uri | { light: string | Uri; dark: string | Uri } | ThemeIcon;

    protected abstract loadData(): Promise<any[] | undefined>;

    protected abstract createChildNodeList(): ExplorerNode[] | undefined;
}
