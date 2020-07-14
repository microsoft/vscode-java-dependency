// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import { ProviderResult, ThemeIcon, TreeItem, TreeItemCollapsibleState } from "vscode";
import { Commands } from "../commands";
import { ExplorerNode } from "./explorerNode";

export class LightWeightNode extends ExplorerNode {
    constructor() {
        super(null);
    }

    public getTreeItem(): TreeItem | Promise<TreeItem> {
        return {
            label: "Click to load dependencies...",
            collapsibleState: TreeItemCollapsibleState.None,
            command: {
                command: Commands.JAVA_SWITCH_SERVER_MODE,
                title: "Switch to Standard mode",
            },
            tooltip: "Switch the Java Language Server to Standard mode to show all the dependencies",
            iconPath: new ThemeIcon("info"),
        };
    }

    public getChildren(): ProviderResult<ExplorerNode[]> {
        return null;
    }
}
