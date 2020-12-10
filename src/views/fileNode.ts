// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Command, ThemeIcon } from "vscode";
import { Commands } from "../commands";
import { Explorer } from "../constants";
import { INodeData } from "../java/nodeData";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";

export class FileNode extends DataNode {
    constructor(nodeData: INodeData, parent: DataNode) {
        super(nodeData, parent);
    }

    protected hasChildren(): boolean {
        return false;
    }

    protected async loadData(): Promise<INodeData[] | undefined> {
        return Promise.resolve(undefined);
    }

    protected createChildNodeList(): ExplorerNode[] | undefined {
        return undefined;
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
