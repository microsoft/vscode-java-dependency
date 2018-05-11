// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ProviderResult, ThemeIcon, TreeItem, TreeItemCollapsibleState, Uri } from "vscode";
import { INodeData } from "../java/nodeData";
import { Telemetry } from "../telemetry";
import { ExplorerNode } from "./explorerNode";

export abstract class DataNode extends ExplorerNode {
    constructor(private _nodeData: INodeData) {
        super();
    }

    public getTreeItem(): TreeItem | Promise<TreeItem> {
        if (this._nodeData) {
            const item = new TreeItem(this._nodeData.name, TreeItemCollapsibleState.Collapsed);
            item.iconPath = this.iconPath;
            item.command = this.command;
            return item;
        }
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

    public getChildren(): ProviderResult<ExplorerNode[]> {
        if (!this._nodeData.children) {
            return this.loadData().then((res) => {
                if (res && res[0]) {
                  Telemetry.sendEvent(`loda data of node with NodeKind: ${res[0].kind}`);
                }
                this._nodeData.children = res;
                return this.createChildNodeList();
            });
        }
        return this.createChildNodeList();
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

    protected abstract get iconPath(): string | Uri | { light: string | Uri; dark: string | Uri } | ThemeIcon;

    protected abstract loadData(): Thenable<any[]>;

    protected abstract createChildNodeList(): ExplorerNode[];
}
