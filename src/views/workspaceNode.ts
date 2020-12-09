// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ThemeIcon } from "vscode";
import { Explorer } from "../constants";
import { Jdtls } from "../java/jdtls";
import { INodeData } from "../java/nodeData";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { ProjectNode } from "./projectNode";

export class WorkspaceNode extends DataNode {
    constructor(nodeData: INodeData, parent?: DataNode) {
        super(nodeData, parent);
    }

    protected loadData(): Thenable<INodeData[] | undefined> {
        if (!this.nodeData.uri) {
            return Promise.resolve(undefined);
        }
        return Jdtls.getProjects(this.nodeData.uri);
    }

    protected createChildNodeList(): ExplorerNode[] {
        const result: ExplorerNode[] = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.nodeData.children.forEach((nodeData) => {
                result.push(new ProjectNode(nodeData, this));
            });
        }
        return result;
    }

    protected get iconPath(): ThemeIcon {
        return new ThemeIcon("root-folder");
    }

    protected get contextValue(): string {
        return Explorer.ContextValueType.WorkspaceFolder;
    }
}
