// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ThemeIcon } from "vscode";
import { Explorer } from "../constants";
import { Jdtls } from "../java/jdtls";
import { INodeData, NodeKind } from "../java/nodeData";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { ProjectNode } from "./projectNode";
import { NodeFactory } from "./nodeFactory";

export class FolderNode extends DataNode {
    constructor(nodeData: INodeData, parent: DataNode, private _project: ProjectNode, private _rootNode?: DataNode) {
        super(nodeData, parent);
    }

    public getLabel(): string {
        return this._nodeData.displayName ?? this._nodeData.name;
    }

    protected async loadData(): Promise<INodeData[]> {
        return Jdtls.getPackageData({
            kind: NodeKind.Folder,
            projectUri: this._project.uri,
            path: this.path,
            rootPath: this._rootNode?.path,
            handlerIdentifier: this._rootNode?.handlerIdentifier,
        });
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

    protected get iconPath(): ThemeIcon {
        return new ThemeIcon("folder");
    }

    protected get contextValue(): string {
        return Explorer.ContextValueType.Folder;
    }
}
