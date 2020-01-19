// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import {
    commands, Event, EventEmitter, ExtensionContext, ProviderResult, Range,
    Selection, TextEditorRevealType, TreeDataProvider, TreeItem, Uri, window, workspace,
} from "vscode";
import { instrumentOperation, instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { Commands } from "../commands";
import { Jdtls } from "../java/jdtls";
import { INodeData, NodeKind } from "../java/nodeData";
import { Settings } from "../settings";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { ProjectNode } from "./projectNode";
import { WorkspaceNode } from "./workspaceNode";

export class DependencyDataProvider implements TreeDataProvider<ExplorerNode> {

    private _onDidChangeTreeData: EventEmitter<null> = new EventEmitter<null>();

    // tslint:disable-next-line:member-ordering
    public onDidChangeTreeData: Event<null> = this._onDidChangeTreeData.event;

    private _rootItems: ExplorerNode[] = null;
    private _refreshDelayTrigger: (() => void) & _.Cancelable;

    constructor(public readonly context: ExtensionContext) {
        context.subscriptions.push(commands.registerCommand(Commands.VIEW_PACKAGE_REFRESH, (debounce?: boolean) => this.refreshWithLog(debounce)));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_REVEAL_FILE_OS, (node: INodeData) =>
            commands.executeCommand("revealFileInOS", Uri.parse(node.uri))));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_COPY_FILE_PATH, (node: INodeData) =>
            commands.executeCommand("copyFilePath", Uri.parse(node.uri))));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_COPY_RELATIVE_FILE_PATH, (node: INodeData) =>
            commands.executeCommand("copyRelativeFilePath", Uri.parse(node.uri))));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_OPEN_FILE, (uri) => this.openFile(uri)));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_OUTLINE, (uri, range) => this.goToOutline(uri, range)));
        Settings.registerConfigurationListener((updatedConfig, oldConfig) => {
            if (updatedConfig.refreshDelay !== oldConfig.refreshDelay) {
                this.setRefreshDelay(updatedConfig.refreshDelay);
            }
        });
        this.setRefreshDelay();
    }

    public refreshWithLog(debounce?: boolean) {
        if (Settings.autoRefresh()) {
            this.refresh(debounce);
        } else {
            instrumentOperation(Commands.VIEW_PACKAGE_REFRESH, () => this.refresh(debounce))();
        }
    }

    public refresh(debounce = false) {
        this._refreshDelayTrigger();
        if (!debounce) { // Immediately refresh
            this._refreshDelayTrigger.flush();
        }
    }

    public setRefreshDelay(wait?: number) {
        if (!wait) {
            wait = Settings.refreshDelay();
        }
        if (this._refreshDelayTrigger) {
            this._refreshDelayTrigger.cancel();
        }
        this._refreshDelayTrigger = _.debounce(() => this.doRefresh(), wait);
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

    public async revealPaths(paths: INodeData[]): Promise<DataNode> {
        const projectNodeData = paths.shift();
        const projects = await this.getRootProjects();
        const project = projects ? <DataNode>projects.find((node: DataNode) =>
            node.path === projectNodeData.path && node.nodeData.name === projectNodeData.name) : undefined;
        return project ? project.revealPaths(paths) : null;
    }

    private doRefresh(): void {
        this._rootItems = null;
        this._onDidChangeTreeData.fire();
    }

    private async getRootProjects(): Promise<ExplorerNode[]> {
        const rootElements = this._rootItems ? this._rootItems : await this.getChildren();
        if (rootElements[0] instanceof ProjectNode) {
            return rootElements;
        } else {
            let result = [];
            for (const rootWorkspace of rootElements) {
                const projects = await rootWorkspace.getChildren();
                result = result.concat(projects);
            }
            return result;
        }
    }

    private getRootNodes(): Thenable<ExplorerNode[]> {
        return new Promise((resolve, reject) => {
            const rootItems = new Array<ExplorerNode>();
            const folders = workspace.workspaceFolders;
            if (folders && folders.length) {
                if (folders.length > 1) {
                    folders.forEach((folder) => rootItems.push(new WorkspaceNode({
                        name: folder.name,
                        uri: folder.uri.toString(),
                        kind: NodeKind.Workspace,
                    }, null)));
                    this._rootItems = rootItems;
                    resolve(rootItems);
                } else {
                    Jdtls.getProjects(folders[0].uri.toString()).then((result: INodeData[]) => {
                        result.forEach((project) => {
                            rootItems.push(new ProjectNode(project, null));
                        });
                        this._rootItems = rootItems;
                        resolve(rootItems);
                    });
                }
            } else {
                reject("No workspace found");
            }
        });
    }
}
