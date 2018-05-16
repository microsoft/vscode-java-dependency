// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import {
    commands, Event, EventEmitter, ExtensionContext, ProviderResult, Range,
    Selection, TextEditorRevealType, TreeDataProvider, TreeItem, Uri, window, workspace,
} from "vscode";
import { Commands } from "../commands";
import { Jdtls } from "../java/jdtls";
import { INodeData, NodeKind } from "../java/nodeData";
import { Telemetry } from "../telemetry";
import { ExplorerNode } from "./explorerNode";
import { ProjectNode } from "./projectNode";
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
            Telemetry.sendEvent("open source file");
            return window.showTextDocument(res);
        });
    }

    public goToOutline(uri: string, range: Range): Thenable<{}> {
        return this.openFile(uri).then((editor) => {
            Telemetry.sendEvent("view package outline");
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
            return this.getRootNodes();
        } else {
            return element.getChildren();
        }
    }

    private getRootNodes(): Thenable<ExplorerNode[]> {
        return new Promise((resolve, reject) => {
            this._rootItems = new Array<ExplorerNode>();
            const folders = workspace.workspaceFolders;
            Telemetry.sendEvent("create workspace node(s)");
            if (folders && folders.length) {
                if (folders.length > 1) {
                    folders.forEach((folder) => this._rootItems.push(new WorkspaceNode({
                        name: folder.name,
                        uri: folder.uri.toString(),
                        kind: NodeKind.Workspace,
                    })));
                    resolve(this._rootItems);
                } else {
                    Jdtls.getProjects(folders[0].uri.toString()).then((result: INodeData[]) => {
                        result.forEach((project) => {
                            this._rootItems.push(new ProjectNode(project));
                        });
                        resolve(this._rootItems);
                    });
                }
            } else {
                reject("No workspace found");
            }
        });
    }
}
