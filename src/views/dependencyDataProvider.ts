// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import {
    commands, Event, EventEmitter, ExtensionContext, ProviderResult, Range,
    Selection, TextEditorRevealType, TreeDataProvider, TreeItem, Uri, window, workspace,
} from "vscode";
import { instrumentOperation } from "vscode-extension-telemetry-wrapper";
import { Commands } from "../commands";
import { Jdtls } from "../java/jdtls";
import { INodeData, NodeKind } from "../java/nodeData";
import { Telemetry } from "../telemetry";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { ProjectNode } from "./projectNode";
import { WorkspaceNode } from "./workspaceNode";

export class DependencyDataProvider implements TreeDataProvider<ExplorerNode> {

    private _onDidChangeTreeData: EventEmitter<null> = new EventEmitter<null>();

    // tslint:disable-next-line:member-ordering
    public onDidChangeTreeData: Event<null> = this._onDidChangeTreeData.event;

    private _rootItems: ExplorerNode[] = null;

    constructor(public readonly context: ExtensionContext) {
        context.subscriptions.push(commands.registerCommand(Commands.VIEW_PACKAGE_REFRESH,
            instrumentOperation(Commands.VIEW_PACKAGE_REFRESH, () => this.refresh())));
        context.subscriptions.push(commands.registerCommand(Commands.VIEW_PACKAGE_OPEN_FILE,
            instrumentOperation(Commands.VIEW_PACKAGE_OPEN_FILE, (_operationId, uri) => this.openFile(uri))));
        context.subscriptions.push(commands.registerCommand(Commands.VIEW_PACKAGE_OUTLINE,
            instrumentOperation(Commands.VIEW_PACKAGE_OUTLINE, (_operationId, uri, range) => this.goToOutline(uri, range))));
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
            return this.getRootNodes();
        } else {
            return element.getChildren();
        }
    }

    public getParent(element: ExplorerNode): ProviderResult<ExplorerNode> {
        return element.getParent();
    }

    public async getRootNodeByData(nodeData: INodeData): Promise<DataNode> {
        // Server only return project nodes, so use get root projects function
        const rootNodes: ExplorerNode[] = await this.getRootProjects();
        return <DataNode>rootNodes.find((node: DataNode) => node.path === nodeData.path && node.nodeData.name === nodeData.name);
    }

    private async getRootProjects(): Promise<ExplorerNode[]> {
        let result = new Array<ExplorerNode>();
        const folders = workspace.workspaceFolders;
        if (folders && folders.length) {
            if (folders.length > 1) {
                const workspaces = folders.map((folder) => new WorkspaceNode({
                    name: folder.name,
                    uri: folder.uri.toString(),
                    kind: NodeKind.Workspace,
                }, null));
                // return projects of all workspaces
                for (const singleworkspace of workspaces) {
                    const projects = await singleworkspace.getChildren();
                    result = result.concat(projects);
                }
            } else {
                const projectsNodeData = await Jdtls.getProjects(folders[0].uri.toString());
                projectsNodeData.forEach((project) => {
                    result.push(new ProjectNode(project, null));
                });
            }
        }
        return result;
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
                    }, null)));
                    resolve(this._rootItems);
                } else {
                    Jdtls.getProjects(folders[0].uri.toString()).then((result: INodeData[]) => {
                        result.forEach((project) => {
                            this._rootItems.push(new ProjectNode(project, null));
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
