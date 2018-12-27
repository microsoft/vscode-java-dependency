// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ExtensionContext, TextEditor, TreeView, TreeViewVisibilityChangeEvent, Uri, window } from "vscode";
import { Jdtls } from "../java/jdtls";
import { INodeData } from "../java/nodeData";
import { Settings } from "../settings";
import { DataNode } from "./dataNode";
import { DependencyDataProvider } from "./dependencyDataProvider";
import { ExplorerNode } from "./explorerNode";

export class DependencyExplorer {

    private _dependencyViewer: TreeView<ExplorerNode>;

    private _dataProvider: DependencyDataProvider;

    private _selectionWhenHidden: DataNode;

    constructor(public readonly context: ExtensionContext) {
        this._dataProvider = new DependencyDataProvider(context);
        this._dependencyViewer = window.createTreeView("javaDependencyExplorer", { treeDataProvider: this._dataProvider });

        window.onDidChangeActiveTextEditor((textEditor: TextEditor) => {
            if (textEditor && textEditor.document && Settings.syncWithFolderExplorer()) {
                this.reveal(textEditor.document.uri);
            }
        });

        this._dependencyViewer.onDidChangeVisibility((e: TreeViewVisibilityChangeEvent) => {
            if (e.visible && this._selectionWhenHidden) {
                this._dependencyViewer.reveal(this._selectionWhenHidden);
                this._selectionWhenHidden = undefined;
            }
        });

        this._dataProvider.onDidChangeTreeData(() => {
            if (window.activeTextEditor) {
                this.reveal(window.activeTextEditor.document.uri);
            }
        });
    }

    public dispose(): void {
    }

    public async reveal(uri: Uri): Promise<void> {
        const paths: INodeData[] = await Jdtls.resolvePath(uri.toString());
        if (!paths || paths.length === 0) {
            return;
        }
        const node = await this._dataProvider.revealPaths(paths);

        if (this._dependencyViewer.visible) {
            this._dependencyViewer.reveal(node);
        } else {
            this._selectionWhenHidden = node;
        }
    }

}
