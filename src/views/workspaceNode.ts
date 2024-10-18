// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ThemeIcon } from "vscode";
import { Explorer } from "../constants";
import { Jdtls } from "../java/jdtls";
import { INodeData } from "../java/nodeData";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { NodeFactory } from "./nodeFactory";

export class WorkspaceNode extends DataNode {
    constructor(nodeData: INodeData, parent?: DataNode) {
        super(nodeData, parent);
    }

    public getLabel(): string {
        return this._nodeData.displayName ?? this._nodeData.name;
    }

    protected async loadData(): Promise<INodeData[] | undefined> {
        if (!this.nodeData.uri) {
            return undefined;
        }
        return Jdtls.getProjects(this.nodeData.uri);
    }

    protected createChildNodeList(): ExplorerNode[] {
        const result: (ExplorerNode | undefined)[] = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.nodeData.children.forEach((nodeData) => {
                result.push(NodeFactory.createNode(nodeData, this));
            });
        }
        return result.filter(<T>(n?: T): n is T => Boolean(n));
    }

    protected get iconPath(): ThemeIcon {
        return new ThemeIcon("root-folder");
    }

    protected get contextValue(): string {
        return Explorer.ContextValueType.WorkspaceFolder;
    }
}
