// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import {
    commands, Event, EventEmitter, ExtensionContext, extensions, ProviderResult,
    Range, TreeDataProvider, TreeItem, Uri, window, workspace,
} from "vscode";
import { instrumentOperation, instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { Commands } from "../commands";
import { newJavaClass, newPackage } from "../explorerCommands/new";
import { createJarFile } from "../exportJarFileCommand";
import { isLightWeightMode, isSwitchingServer } from "../extension";
import { Jdtls } from "../java/jdtls";
import { INodeData, NodeKind } from "../java/nodeData";
import { Settings } from "../settings";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { explorerNodeCache } from "./nodeCache/explorerNodeCache";
import { ProjectNode } from "./projectNode";
import { WorkspaceNode } from "./workspaceNode";

export class DependencyDataProvider implements TreeDataProvider<ExplorerNode> {

    private _onDidChangeTreeData: EventEmitter<ExplorerNode | null | undefined> = new EventEmitter<ExplorerNode | null | undefined>();

    // tslint:disable-next-line:member-ordering
    public onDidChangeTreeData: Event<ExplorerNode | null | undefined> = this._onDidChangeTreeData.event;

    private _rootItems: ExplorerNode[] = null;
    private _refreshDelayTrigger: ((element?: ExplorerNode) => void) & _.Cancelable;

    constructor(public readonly context: ExtensionContext) {
        context.subscriptions.push(commands.registerCommand(Commands.VIEW_PACKAGE_REFRESH, (debounce?: boolean, element?: ExplorerNode) =>
            this.refreshWithLog(debounce, element)));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_EXPORT_JAR, (node: INodeData) => createJarFile(node)));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_NEW_JAVA_CLASS, (node: DataNode) => newJavaClass(node)));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_NEW_JAVA_PACKAGE, (node: DataNode) => newPackage(node)));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_REVEAL_FILE_OS, (node?: INodeData) =>
            commands.executeCommand("revealFileInOS", Uri.parse(node.uri))));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_COPY_FILE_PATH, (node: INodeData) =>
            commands.executeCommand("copyFilePath", Uri.parse(node.uri))));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_COPY_RELATIVE_FILE_PATH, (node: INodeData) =>
            commands.executeCommand("copyRelativeFilePath", Uri.parse(node.uri))));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_OPEN_FILE, (uri) =>
                commands.executeCommand(Commands.VSCODE_OPEN, Uri.parse(uri))));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_OUTLINE, (uri, range) =>
                window.showTextDocument(Uri.parse(uri), { selection: range })));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.JAVA_PROJECT_BUILD_WORKSPACE, () =>
            commands.executeCommand(Commands.JAVA_BUILD_WORKSPACE)));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.JAVA_PROJECT_CLEAN_WORKSPACE, () =>
            commands.executeCommand(Commands.JAVA_CLEAN_WORKSPACE)));
        Settings.registerConfigurationListener((updatedConfig, oldConfig) => {
            if (updatedConfig.refreshDelay !== oldConfig.refreshDelay) {
                this.setRefreshDelay(updatedConfig.refreshDelay);
            }
        });
        this.setRefreshDelay();
    }

    public refreshWithLog(debounce?: boolean, element?: ExplorerNode) {
        if (Settings.autoRefresh()) {
            this.refresh(debounce, element);
        } else {
            instrumentOperation(Commands.VIEW_PACKAGE_REFRESH, () => this.refresh(debounce, element))();
        }
    }

    public refresh(debounce = false, element?: ExplorerNode) {
        this._refreshDelayTrigger(element);
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
        this._refreshDelayTrigger = _.debounce(this.doRefresh, wait);
    }

    public getTreeItem(element: ExplorerNode): TreeItem | Thenable<TreeItem> {
        return element.getTreeItem();
    }

    public async getChildren(element?: ExplorerNode): Promise<ExplorerNode[]> {
        if (isLightWeightMode()) {
            return [];
        }

        if (isSwitchingServer()) {
            await new Promise<void>((resolve: () => void): void => {
                extensions.getExtension("redhat.java")!.exports.onDidServerModeChange(resolve);
            });
        }

        const children: ExplorerNode[] = (!this._rootItems || !element) ?
            await this.getRootNodes() : await element.getChildren();
        explorerNodeCache.saveNodes(children);
        return children;
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

    private doRefresh(element?: ExplorerNode): void {
        if (!element) {
            this._rootItems = undefined;
        }
        explorerNodeCache.removeNodeChildren(element);
        this._onDidChangeTreeData.fire(element);
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
