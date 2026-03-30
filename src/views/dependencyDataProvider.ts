// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import {
    commands, Event, EventEmitter, ExtensionContext, ProviderResult,
    RelativePattern, TreeDataProvider, TreeItem, Uri, window, workspace,
} from "vscode";
import { instrumentOperationAsVsCodeCommand, sendError } from "vscode-extension-telemetry-wrapper";
import { ContainerNode, contextManager } from "../../extension.bundle";
import { Commands } from "../commands";
import { Context } from "../constants";
import { appendOutput, executeExportJarTask } from "../tasks/buildArtifact/BuildArtifactTaskProvider";
import { Jdtls } from "../java/jdtls";
import { INodeData, NodeKind } from "../java/nodeData";
import { languageServerApiManager } from "../languageServerApi/languageServerApiManager";
import { Settings } from "../settings";
import { explorerLock } from "../utils/Lock";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { explorerNodeCache } from "./nodeCache/explorerNodeCache";
import { ProjectNode } from "./projectNode";
import { WorkspaceNode } from "./workspaceNode";

export class DependencyDataProvider implements TreeDataProvider<ExplorerNode> {

    private _onDidChangeTreeData: EventEmitter<ExplorerNode | null | undefined> = new EventEmitter<ExplorerNode | null | undefined>();

    // tslint:disable-next-line:member-ordering
    public onDidChangeTreeData: Event<ExplorerNode | null | undefined> = this._onDidChangeTreeData.event;

    private _rootItems: ExplorerNode[] | undefined = undefined;
    private _refreshDelayTrigger: _.DebouncedFunc<((element?: ExplorerNode) => void)>;
    /**
     * The element which is pending to be refreshed.
     * `undefined` denotes to root node.
     * `null` means no node is pending.
     */
    private pendingRefreshElement: ExplorerNode | undefined | null;
    /** Resolved when the first batch of progressive items arrives. */
    private _progressiveItemsReady: Promise<void> | undefined;
    private _resolveProgressiveItems: (() => void) | undefined;

    constructor(public readonly context: ExtensionContext) {
        // commands that do not send back telemetry
        context.subscriptions.push(commands.registerCommand(Commands.VIEW_PACKAGE_INTERNAL_REFRESH, (debounce?: boolean, element?: ExplorerNode) =>
            this.refresh(debounce, element)));
        context.subscriptions.push(commands.registerCommand(Commands.VIEW_PACKAGE_INTERNAL_ADD_PROJECTS, (projectUris: string[]) =>
            this.addProgressiveProjects(projectUris)));
        context.subscriptions.push(commands.registerCommand(Commands.EXPORT_JAR_REPORT, (terminalId: string, message: string) => {
            appendOutput(terminalId, message);
        }));

        // normal commands
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_REFRESH, (debounce?: boolean, element?: ExplorerNode) =>
            this.refresh(debounce, element)));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_EXPORT_JAR, async (node: INodeData) => {
            executeExportJarTask(node);
        }));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_OUTLINE, (uri, range) =>
            window.showTextDocument(Uri.parse(uri), { selection: range })));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.JAVA_PROJECT_BUILD_WORKSPACE, () =>
            commands.executeCommand(Commands.JAVA_BUILD_WORKSPACE, true /*fullCompile*/)));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.JAVA_PROJECT_CLEAN_WORKSPACE, () =>
            commands.executeCommand(Commands.JAVA_CLEAN_WORKSPACE)));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.JAVA_PROJECT_UPDATE, async (node: INodeData) => {
            if (!node.uri) {
                sendError(new Error("Uri not available when reloading project"));
                window.showErrorMessage("The URI of the project is not available, you can try to trigger the command 'Java: Reload Project' from Command Palette.");
                return;
            }
            const pattern: RelativePattern = new RelativePattern(Uri.parse(node.uri).fsPath?.replace(/[\\\/]+$/, ""), "{pom.xml,*.gradle}");
            const uris: Uri[] = await workspace.findFiles(pattern, null /*exclude*/, 1 /*maxResults*/);
            if (uris.length >= 1) {
                commands.executeCommand(Commands.JAVA_PROJECT_CONFIGURATION_UPDATE, uris[0]);
            }
        }));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.JAVA_PROJECT_REBUILD, async (node: INodeData) => {
            if (!node.uri) {
                sendError(new Error("Uri not available when building project"));
                window.showErrorMessage("The URI of the project is not available, you can try to trigger the command 'Java: Rebuild Projects' from Command Palette.");
                return;
            }
            commands.executeCommand(Commands.BUILD_PROJECT, Uri.parse(node.uri), true);
        }));

        this.setRefreshDebounceFunc();
    }

    public refresh(debounce = false, element?: ExplorerNode) {
        if (element === undefined || this.pendingRefreshElement === undefined) {
            this._refreshDelayTrigger(undefined);
            this.pendingRefreshElement = undefined;
        } else if (this.pendingRefreshElement === null
                || element.isItselfOrAncestorOf(this.pendingRefreshElement)) {
            this._refreshDelayTrigger(element);
            this.pendingRefreshElement = element;
        } else if (this.pendingRefreshElement.isItselfOrAncestorOf(element)) {
            this._refreshDelayTrigger(this.pendingRefreshElement);
        } else {
            this._refreshDelayTrigger.flush();
            this._refreshDelayTrigger(element);
            this.pendingRefreshElement = element;
        }
        if (!debounce) { // Immediately refresh
            this._refreshDelayTrigger.flush();
        }
    }

    public setRefreshDebounceFunc(wait?: number) {
        if (!wait) {
            wait = Settings.refreshDelay();
        }
        if (this._refreshDelayTrigger) {
            this._refreshDelayTrigger.cancel();
        }
        this._refreshDelayTrigger = _.debounce(this.doRefresh, wait);
    }

    public getTreeItem(element: ExplorerNode): TreeItem | Promise<TreeItem> {
        return element.getTreeItem();
    }

    public async getChildren(element?: ExplorerNode): Promise<ExplorerNode[] | undefined | null> {
        // Fast path: if root items are already populated by progressive loading
        // (addProgressiveProjects), return them directly without querying the
        // server, which may be blocked during long-running imports.
        if (!element && this._rootItems && this._rootItems.length > 0) {
            explorerNodeCache.saveNodes(this._rootItems);
            return this._rootItems;
        }

        if (!await languageServerApiManager.ready()) {
            return [];
        }

        // During progressive loading (server running but not fully ready after
        // a clean workspace), don't enter getRootNodes() — its server queries
        // will block for the entire import duration. Instead, keep the TreeView
        // progress spinner visible by awaiting until the first progressive
        // notification delivers items.
        if (!element && !languageServerApiManager.isFullyReady()) {
            if (!this._rootItems || this._rootItems.length === 0) {
                if (!this._progressiveItemsReady) {
                    this._progressiveItemsReady = new Promise<void>((resolve) => {
                        this._resolveProgressiveItems = resolve;
                    });
                }
                // Race with a timeout to prevent hanging indefinitely if no
                // progressive notifications arrive (e.g., small project or
                // server failure). After timeout, fall through to normal path.
                const timeout = new Promise<void>((resolve) => setTimeout(resolve, 30_000));
                await Promise.race([this._progressiveItemsReady, timeout]);
            }
            return this._rootItems || [];
        }

        const children = (!this._rootItems || !element) ?
            await this.getRootNodes() : await element.getChildren();

        if (children && element instanceof ContainerNode) {
            if (element.isMavenType()) {
                children.sort((a, b) => {
                    return a.getDisplayName().localeCompare(b.getDisplayName());
                });
            }
        }

        explorerNodeCache.saveNodes(children || []);
        return children;
    }

    public getParent(element: ExplorerNode): ProviderResult<ExplorerNode> {
        return element.getParent();
    }

    public async revealPaths(paths: INodeData[]): Promise<DataNode | undefined> {
        const projectNodeData = paths.shift();
        const projects = await this.getRootProjects();
        const project = projects ? <DataNode>projects.find((node: DataNode) =>
            node.path === projectNodeData?.path && node.nodeData.name === projectNodeData?.name) : undefined;
        return project?.revealPaths(paths);
    }

    public async getRootProjects(): Promise<ExplorerNode[]> {
        const rootElements = await this.getRootNodes();
        if (rootElements[0] instanceof ProjectNode) {
            return rootElements;
        } else {
            let result: ExplorerNode[] = [];
            for (const rootWorkspace of rootElements) {
                const projects = await rootWorkspace.getChildren();
                if (projects) {
                    result = result.concat(projects);
                }
            }
            return result;
        }
    }

    private doRefresh(element?: ExplorerNode): void {
        if (!element) {
            this._rootItems = undefined;
            // Resolve any pending progressive await so getChildren() doesn't hang
            if (this._resolveProgressiveItems) {
                this._resolveProgressiveItems();
                this._resolveProgressiveItems = undefined;
                this._progressiveItemsReady = undefined;
            }
        }
        explorerNodeCache.removeNodeChildren(element);
        this._onDidChangeTreeData.fire(element);
        this.pendingRefreshElement = null;
    }

    /**
     * Add projects progressively from ProjectsImported notifications.
     * This directly creates ProjectNode items from URIs without querying
     * the JDTLS server, which may be blocked during long-running imports.
     */
    public addProgressiveProjects(projectUris: string[]): void {
        const folders = workspace.workspaceFolders;
        if (!folders || !folders.length) {
            return;
        }

        if (!this._rootItems) {
            this._rootItems = [];
        }

        const existingUris = new Set(
            this._rootItems
                .filter((n): n is ProjectNode => n instanceof ProjectNode)
                .map((n) => n.uri)
        );

        let added = false;
        for (const uriStr of projectUris) {
            if (existingUris.has(uriStr)) {
                continue;
            }
            // Extract project name from URI (last non-empty path segment)
            const name = uriStr.replace(/\/+$/, "").split("/").pop() || "unknown";
            const nodeData: INodeData = {
                name,
                uri: uriStr,
                kind: NodeKind.Project,
            };
            this._rootItems.push(new ProjectNode(nodeData, undefined));
            existingUris.add(uriStr);
            added = true;
        }

        if (added) {
            // Resolve the pending getChildren() promise so the TreeView
            // spinner stops and items appear.
            if (this._resolveProgressiveItems) {
                this._resolveProgressiveItems();
                this._resolveProgressiveItems = undefined;
                this._progressiveItemsReady = undefined;
            }
            this._onDidChangeTreeData.fire(undefined);
        }
    }

    private async getRootNodes(): Promise<ExplorerNode[]> {
        try {
            await explorerLock.acquireAsync();

            if (this._rootItems) {
                return this._rootItems;
            }

            const hasJavaError: boolean = await Jdtls.checkImportStatus();
            if (hasJavaError) {
                contextManager.setContextValue(Context.IMPORT_FAILED, true);
                return [];
            }

            const rootItems: ExplorerNode[] = [];
            const folders = workspace.workspaceFolders;
            if (folders && folders.length) {
                if (folders.length > 1) {
                    folders.forEach((folder) => rootItems.push(new WorkspaceNode({
                        name: folder.name,
                        uri: folder.uri.toString(),
                        kind: NodeKind.Workspace,
                    }, undefined)));
                    this._rootItems = rootItems;
                } else {
                    const result: INodeData[] = await Jdtls.getProjects(folders[0].uri.toString());
                    result.forEach((project) => {
                        rootItems.push(new ProjectNode(project, undefined));
                    });
                    this._rootItems = rootItems;
                }
            }
            contextManager.setContextValue(Context.NO_JAVA_PROJECT, _.isEmpty(rootItems));
            return rootItems;
        } finally {
            explorerLock.release();
        }
    }
}
