// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Command, ThemeColor, ThemeIcon, TreeItem, TreeItemCollapsibleState } from "vscode";
import { Commands } from "../commands";
import { INodeData } from "../java/nodeData";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { Explorer } from "../constants";

export class FileNode extends DataNode {
    constructor(nodeData: INodeData, parent: DataNode) {
        super(nodeData, parent);
    }

    protected hasChildren(): boolean {
        return false;
    }

    protected loadData(): Thenable<INodeData[]> {
        return Promise.resolve(null);
    }

    protected createChildNodeList(): ExplorerNode[] {
        return null;
    }

    protected get iconPath(): ThemeIcon {
        return ThemeIcon.File;
    }

    protected get command(): Command {
        return {
            title: "Open file",
            command: Commands.VIEW_PACKAGE_OPEN_FILE,
            arguments: [this.uri],
        };
    }

    protected get contextValue(): string {
        return Explorer.ContextValueType.File;
    }
}
