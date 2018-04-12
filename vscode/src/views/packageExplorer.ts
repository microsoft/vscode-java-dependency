import * as vscode from 'vscode';
import { Commands } from '../commands';
import { ExplorerNode } from './explorerNode';
import { WorkspaceNode } from './workspaceNode';
import { NodeKind } from '../java/nodeData';

export class PackageExplorer implements vscode.TreeDataProvider<ExplorerNode> {
    constructor(public readonly context: vscode.ExtensionContext) {
        context.subscriptions.push(vscode.commands.registerCommand(Commands.VIEW_PACKAGE_REFRESH, this.refresh, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.VIEW_PACKAGE_OPEN_FILE, this.openFile, this));
    }

    private _rootItems: ExplorerNode[] = null;

    private _onDidChangeTreeData: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();

    public readonly onDidChangeTreeData: vscode.Event<null> = this._onDidChangeTreeData.event;

    getTreeItem(element: ExplorerNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element.getTreeItem();
    }

    getChildren(element?: ExplorerNode): vscode.ProviderResult<ExplorerNode[]> {
        if (!this._rootItems || !element) {
            this._rootItems = this.getRootNodes();
            return this._rootItems;
        } else {
            return element.getChildren();
        }
    }

    public refresh() {
        this._rootItems = null;
        this._onDidChangeTreeData.fire();
    }

    public openFile(query) {
        vscode.workspace.openTextDocument(vscode.Uri.parse(query.path)).then((res) => {
            vscode.window.showTextDocument(res);
        });
    }

    private getRootNodes() {
        const result: ExplorerNode[] = new Array<ExplorerNode>();
        const folders = vscode.workspace.workspaceFolders;
        if (folders && folders.length) {
            folders.forEach((folder) => result.push(new WorkspaceNode({
                name: folder.name,
                uri: folder.uri.toString(),
                kind: NodeKind.Workspace
            })));
        }
        return result;
    }
}
