// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import { ThemeIcon, TreeItem, TreeItemCollapsibleState, Uri } from "vscode";
import { INodeData } from "../java/nodeData";
import { Lock } from "../utils/Lock";
import { ExplorerNode } from "./explorerNode";

export abstract class DataNode extends ExplorerNode {

    protected _lock: Lock = new Lock();

    constructor(protected _nodeData: INodeData, parent: DataNode) {
        super(parent);
    }

    public getTreeItem(): TreeItem | Promise<TreeItem> {
        if (this._nodeData) {
            const item = new TreeItem(
                this._nodeData.displayName || this._nodeData.name,
                this.hasChildren() ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None,
            );
            item.description = this.description;
            item.iconPath = this.iconPath;
            item.command = this.command;
            item.contextValue = this.computeContextValue();
            return item;
        }
        return undefined;
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

    public async revealPaths(paths: INodeData[]): Promise<DataNode> {
        if (_.isEmpty(paths)) {
            return this;
        }
        const childNodeData = paths.shift();
        const children: ExplorerNode[] = await this.getChildren();
        const childNode = children ? <DataNode>children.find((child: DataNode) =>
            child.nodeData.name === childNodeData.name && child.path === childNodeData.path) : undefined;
        return (childNode && paths.length) ? childNode.revealPaths(paths) : childNode;
    }

    public async getChildren(): Promise<ExplorerNode[]> {
        try {
            await this._lock.acquire();
            if (!this._nodeData.children) {
                const data = await this.loadData();
                this._nodeData.children = data;
                return this.createChildNodeList();
            }
            return this.createChildNodeList();
        } finally {
            this._lock.release();
        }
    }

    public computeContextValue(): string {
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
        this.nodeData.children.sort((a: INodeData, b: INodeData) => {
            if (a.kind === b.kind) {
                return a.name < b.name ? -1 : 1;
            } else {
                return a.kind - b.kind;
            }
        });
    }

    protected hasChildren(): boolean {
        return true;
    }

    protected get description(): string | boolean {
        return undefined;
    }

    protected get contextValue(): string {
        return undefined;
    }

    protected abstract get iconPath(): string | Uri | { light: string | Uri; dark: string | Uri } | ThemeIcon;

    protected abstract loadData(): Thenable<any[]>;

    protected abstract createChildNodeList(): ExplorerNode[];
}
