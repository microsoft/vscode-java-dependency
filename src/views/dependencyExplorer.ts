// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, Disposable, ExtensionContext, TextEditor, TreeView, TreeViewVisibilityChangeEvent, Uri, window } from "vscode";
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { Commands } from "../commands";
import { isStandardServerReady } from "../extension";
import { Jdtls } from "../java/jdtls";
import { INodeData } from "../java/nodeData";
import { Settings } from "../settings";
import { DataNode } from "./dataNode";
import { DependencyDataProvider } from "./dependencyDataProvider";
import { ExplorerNode } from "./explorerNode";
import { explorerNodeCache } from "./nodeCache/explorerNodeCache";

export class DependencyExplorer implements Disposable {

    private _dependencyViewer: TreeView<ExplorerNode>;

    private _dataProvider: DependencyDataProvider;

    constructor(public readonly context: ExtensionContext) {
        this._dataProvider = new DependencyDataProvider(context);
        this._dependencyViewer = window.createTreeView("javaProjectExplorer", { treeDataProvider: this._dataProvider, showCollapseAll: true });

        context.subscriptions.push(
            window.onDidChangeActiveTextEditor((textEditor: TextEditor) => {
                if (this._dependencyViewer.visible && textEditor && textEditor.document && Settings.syncWithFolderExplorer()) {
                    this.reveal(textEditor.document.uri);
                }
            }),
        );

        context.subscriptions.push(
            this._dependencyViewer.onDidChangeVisibility((e: TreeViewVisibilityChangeEvent) => {
                if (e.visible && window.activeTextEditor && Settings.syncWithFolderExplorer()) {
                    this.reveal(window.activeTextEditor.document.uri);
                }
            }),
        );

        context.subscriptions.push(
            this._dataProvider.onDidChangeTreeData(() => {
                if (window.activeTextEditor && Settings.syncWithFolderExplorer()) {
                    this.reveal(window.activeTextEditor.document.uri);
                }
            }),
        );

        context.subscriptions.push(
            instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_REVEAL_IN_PROJECT_EXPLORER, async (uri: Uri) => {
                await commands.executeCommand(Commands.JAVA_PROJECT_EXPLORER_FOCUS);
                await commands.executeCommand(Commands.VIEW_PACKAGE_OPEN_FILE, uri);
                this.reveal(uri);
            }),
        );
    }

    public dispose(): void {
        if (this._dependencyViewer) {
            this._dependencyViewer.dispose();
        }
    }

    public async reveal(uri: Uri): Promise<void> {
        if (!isStandardServerReady()) {
            return;
        }

        let node: DataNode | undefined = explorerNodeCache.getDataNode(uri);
        if (!node) {
            const paths: INodeData[] = await Jdtls.resolvePath(uri.toString());
            if (!paths || paths.length === 0) {
                return;
            }
            node = await this._dataProvider.revealPaths(paths);
        }

        if (this._dependencyViewer.visible) {
            this._dependencyViewer.reveal(node);
        }
    }
}
