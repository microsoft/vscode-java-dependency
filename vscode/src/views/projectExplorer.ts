// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import {
    commands, Event, EventEmitter, ExtensionContext, ProviderResult, Range, Selection,
    TextEditorRevealType, TreeDataProvider, TreeItem, Uri, window, workspace,
} from "vscode";
import { Commands } from "../commands";
import { NodeKind } from "../java/nodeData";
import { ExplorerNode } from "./explorerNode";
import { WorkspaceNode } from "./workspaceNode";

export class ProjectExplorer implements TreeDataProvider<ExplorerNode> {

    private _onDidChangeTreeData: EventEmitter<null> = new EventEmitter<null>();

    // tslint:disable-next-line:member-ordering
    public onDidChangeTreeData: Event<null> = this._onDidChangeTreeData.event;

    private _rootItems: ExplorerNode[] = null;

    constructor(public readonly context: ExtensionContext) {
        context.subscriptions.push(commands.registerCommand(Commands.VIEW_PACKAGE_REFRESH, this.refresh, this));
        context.subscriptions.push(commands.registerCommand(Commands.VIEW_PACKAGE_OPEN_FILE, this.openFile, this));
        context.subscriptions.push(commands.registerCommand(Commands.VIEW_PACKAGE_OUTLINE, this.goToOutline, this));
    }

    public refresh() {
        this._rootItems = null;
        this._onDidChangeTreeData.fire();
    }

    public openFile(uri: string) {
        return workspace.openTextDocument(Uri.parse(uri)).then((res) => {
            return window.showTextDocument(res);
        });
    }

    public goToOutline(uri: string, range: Range): Thenable<{}> {
        return this.openFile(uri).then((editor) => {
            editor.revealRange(range, TextEditorRevealType.Default);
            editor.selection = new Selection(range.start, range.start);
            return commands.executeCommand("workbench.action.focusActiveEditorGroup");
        });
    }

    public getTreeItem(element: ExplorerNode): TreeItem | Thenable<TreeItem> {
        return element.getTreeItem();
    }

    public getChildren(element?: ExplorerNode): ProviderResult<ExplorerNode[]> {
        if (!this._rootItems || !element) {
            this._rootItems = this.getRootNodes();
            return this._rootItems;
        } else {
            return element.getChildren();
        }
    }

    private getRootNodes() {
        const result: ExplorerNode[] = new Array<ExplorerNode>();
        const folders = workspace.workspaceFolders;
        if (folders && folders.length) {
            folders.forEach((folder) => result.push(new WorkspaceNode({
                name: folder.name,
                uri: folder.uri.toString(),
                kind: NodeKind.Workspace,
            })));
        }
        return result;
    }
}
