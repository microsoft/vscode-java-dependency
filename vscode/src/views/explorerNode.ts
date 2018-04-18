import { Command, ProviderResult, TreeItem } from "vscode";

export abstract class ExplorerNode {
    constructor() {
    }

    protected get command(): Command {
        return undefined;
    }

    public abstract getChildren(): ProviderResult<ExplorerNode[]>;

    public abstract getTreeItem(): TreeItem | Promise<TreeItem>;
}
