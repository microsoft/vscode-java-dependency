
import { ExplorerNode } from "./explorerNode";
import { INodeData } from "../java/nodeData";
import { ProviderResult, TreeItem, TreeItemCollapsibleState } from "vscode";

export abstract class DataNode extends ExplorerNode {
    constructor(private _nodeData: INodeData) {
        super();
    }

    public getTreeItem(): TreeItem | Promise<TreeItem> {
        if (this._nodeData) {
            const item = new TreeItem(this._nodeData.name, TreeItemCollapsibleState.Collapsed);
            item.iconPath = {};
            return item;
        }
    }

    public get nodeData(): INodeData {
        return this._nodeData;
    }

    public get uri() {
        return this._nodeData.uri;
    }

    public get path() {
        return this._nodeData.path;
    }

    public getChildren(): ProviderResult<ExplorerNode[]> {
        if (!this._nodeData.children) {
            return this.loadData().then((res) => {
                this._nodeData.children = res;
                return this.createChildNodeList();
            });
        }
        return this.createChildNodeList();
    }

    protected abstract loadData(): Thenable<INodeData[]>;

    protected abstract createChildNodeList(): ExplorerNode[];
}
