// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ThemeIcon } from "vscode";
import { Jdtls } from "../java/jdtls";
import { INodeData, NodeKind } from "../java/nodeData";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { FileNode } from "./fileNode";
import { ProjectNode } from "./projectNode";

export class FolderNode extends DataNode {
    constructor(nodeData: INodeData, parent: DataNode, private _project: ProjectNode, private _rootNode: DataNode) {
        super(nodeData, parent);
    }

    protected loadData(): Thenable<INodeData[]> {
        return Jdtls.getPackageData({
            kind: NodeKind.Folder,
            projectUri: this._project.uri,
            path: this.path,
            handlerIdentifier: this._rootNode.handlerIdentifier,
        });
    }

    protected createChildNodeList(): ExplorerNode[] {
        const result = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.sort();
            this.nodeData.children.forEach((nodeData) => {
                if (nodeData.kind === NodeKind.File) {
                    result.push(new FileNode(nodeData, this));
                } else if (nodeData.kind === NodeKind.Folder) {
                    result.push(new FolderNode(nodeData, this, this._project, this._rootNode));
                }
            });
        }
        return result;
    }

    protected get iconPath(): ThemeIcon {
        return new ThemeIcon("folder");
    }
}
