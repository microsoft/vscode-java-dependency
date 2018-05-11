// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Command, ProviderResult, TreeItem } from "vscode";
import { Services } from "../services";

export abstract class ExplorerNode {

    public static resolveIconPath(fileName: string): { light: string; dark: string } {
        return {
            light: Services.context.asAbsolutePath(`./images/light/${fileName}.svg`),
            dark: Services.context.asAbsolutePath(`./images/light/${fileName}.svg`),
        };
    }

    constructor() {
    }

    protected get command(): Command {
        return undefined;
    }

    public abstract getChildren(): ProviderResult<ExplorerNode[]>;

    public abstract getTreeItem(): TreeItem | Promise<TreeItem>;
}
