// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import * as fse from "fs-extra";
import { commands, Disposable, FileSystemWatcher, RelativePattern, Uri, workspace } from "vscode";
import { instrumentOperation } from "vscode-extension-telemetry-wrapper";
import { Commands } from "./commands";
import { NodeKind } from "./java/nodeData";
import { languageServerApiManager } from "./languageServerApi/languageServerApiManager";
import { Settings } from "./settings";
import { DataNode } from "./views/dataNode";
import { ExplorerNode } from "./views/explorerNode";
import { explorerNodeCache } from "./views/nodeCache/explorerNodeCache";

const ENABLE_AUTO_REFRESH: string = "java.view.package.enableAutoRefresh";
const DISABLE_AUTO_REFRESH: string = "java.view.package.disableAutoRefresh";

class SyncHandler implements Disposable {

    private disposables: Disposable[] = [];

    public updateFileWatcher(autoRefresh?: boolean): void {
        this.dispose();
        if (autoRefresh) {
            instrumentOperation(ENABLE_AUTO_REFRESH, () => this.enableAutoRefresh())();
        } else {
            instrumentOperation(DISABLE_AUTO_REFRESH, () => {})();
        }
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            if (disposable) {
                disposable.dispose();
            }
        }
        this.disposables = [];
    }

    private async enableAutoRefresh() {
        if (!await languageServerApiManager.ready()) {
            return;
        }

        this.disposables.push(workspace.onDidChangeWorkspaceFolders(() => {
            this.refresh();
        }));

        try {
            const result: IListCommandResult | undefined = await commands.executeCommand<IListCommandResult>(Commands.EXECUTE_WORKSPACE_COMMAND,
                Commands.JAVA_PROJECT_LIST_SOURCE_PATHS);
            if (!result || !result.status || !result.data || result.data.length === 0) {
                throw new Error("Failed to list the source paths");
            }

            for (const sourcePathData of result.data) {
                const normalizedPath: string = Uri.file(sourcePathData.path).fsPath;
                if (!(await fse.pathExists(normalizedPath))) {
                    continue;
                }
                const pattern: RelativePattern = new RelativePattern(normalizedPath, "**/*");
                const watcher: FileSystemWatcher = workspace.createFileSystemWatcher(pattern);
                this.disposables.push(watcher);
                this.setupWatchers(watcher);
            }
        } catch (e) {
            const fileSystemWatcher: FileSystemWatcher = workspace.createFileSystemWatcher("**/{*.java,src/**}");
            this.disposables.push(fileSystemWatcher);
            this.setupWatchers(fileSystemWatcher);
        }
    }

    private setupWatchers(watcher: FileSystemWatcher): void {
        this.disposables.push(watcher.onDidChange((uri: Uri) => {
            if (path.extname(uri.fsPath) !== ".java" || !Settings.showMembers()) {
                return;
            }
            const node: DataNode | undefined = explorerNodeCache.getDataNode(uri);
            this.refresh(node);
        }));

        this.disposables.push(watcher.onDidCreate((uri: Uri) => {
            this.refresh(this.getParentNodeInExplorer(uri));
        }));

        this.disposables.push(watcher.onDidDelete((uri: Uri) => {
            this.refresh(this.getParentNodeInExplorer(uri));
        }));

    }

    private getParentNodeInExplorer(uri: Uri): ExplorerNode | undefined {
        let node: DataNode | undefined = explorerNodeCache.findBestMatchNodeByUri(uri);

        if (!node) {
            return undefined;
        }

        if (Settings.isHierarchicalView()) {
            // TODO: has to get the hierarchical package root node due to the java side implementation
            // because currently it will only get the types for a package node but no child packages.
            while (node && node.nodeData.kind !== NodeKind.PackageRoot) {
                node = <DataNode>node.getParent();
            }
            return node;
        } else {
            // in flat view
            if (path.extname(uri.fsPath) === ".java" && node.uri &&
                    Uri.parse(node.uri).fsPath === path.dirname(uri.fsPath)) {
                // if the returned node is direct parent of the input uri, refresh it.
                return node;
            } else {
                // the direct parent is not rendered in the explorer, the returned node
                // is other package fragment, we need to refresh the package fragment root.
                while (node && node.nodeData.kind > NodeKind.PackageRoot) {
                    node = <DataNode>node.getParent();
                }
                return node;
            }
        }
    }

    private refresh(node?: ExplorerNode): void {
        commands.executeCommand(Commands.VIEW_PACKAGE_INTERNAL_REFRESH, /* debounce = */true, node);
    }
}

interface ISourcePath {
    path: string;
    displayPath: string;
    projectName: string;
    projectType: string;
}

interface IListCommandResult {
    status: boolean;
    message: string;
    data?: ISourcePath[];
}

export const syncHandler: SyncHandler = new SyncHandler();
