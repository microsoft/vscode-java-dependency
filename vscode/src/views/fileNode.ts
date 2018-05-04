// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Command } from "vscode";
import { Commands } from "../commands";
import { INodeData } from "../java/nodeData";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";

export class FileNode extends DataNode {
    constructor(nodeData: INodeData) {
        super(nodeData);
    }

    protected loadData(): Thenable<INodeData[]> {
        return null;
    }

    protected createChildNodeList(): ExplorerNode[] {
        return null;
    }

    protected get iconPath(): string {
        return "./images/file.png";
    }

    protected get command(): Command {
        return {
            title: "Open file",
            command: Commands.VIEW_PACKAGE_OPEN_FILE,
            arguments: [this.uri],
        };
    }
}
