// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ExtensionContext, ProviderResult, TextEditor, TreeView, Uri, window } from "vscode";
import { Jdtls } from "../java/jdtls";
import { INodeData } from "../java/nodeData";
import { Settings } from "../settings";
import { Utility } from "../utility";
import { DataNode } from "./dataNode";
import { DependencyDataProvider } from "./dependencyDataProvider";
import { ExplorerNode } from "./explorerNode";

export class DependencyExplorer {

    private _dependencyViewer: TreeView<ExplorerNode>;

    private _dataProvider: DependencyDataProvider;

    constructor(public readonly context: ExtensionContext) {
        this._dataProvider = new DependencyDataProvider(context);
        this._dependencyViewer = window.createTreeView("javaDependencyExplorer", { treeDataProvider: this._dataProvider });

        window.onDidChangeActiveTextEditor((textEditor: TextEditor) => {
            if (textEditor && textEditor.document && textEditor.document.languageId === "java" && Settings.syncWithFolderExplorer()) {
                this.reveal(textEditor.document.uri);
            }
        });
    }

    public dispose(): void {
    }

    public reveal(uri: Uri): void {
        Jdtls.resolvePath(uri.toString()).then((paths: INodeData[]) => {
            this.revealPath(this._dataProvider, paths);
        });
    }

    private revealPath(current: { getChildren: (element?: ExplorerNode) => ProviderResult<ExplorerNode[]> }, paths: INodeData[]) {
        if (!current) {
            return;
        }

        const res = current.getChildren();
        if (Utility.isThenable(res)) {
            res.then((children: DataNode[]) => {
                this.visitChildren(children, paths);
            });
        } else {
            this.visitChildren(<DataNode[]>res, paths);
        }
    }

    private visitChildren(children: DataNode[], paths: INodeData[]): void {
        if (children && paths) {
            for (const c of children) {
                if (c.path === paths[0].path) {
                    if (paths.length === 1) {
                        this._dependencyViewer.reveal(c);
                    } else {
                        paths.shift();
                        this.revealPath(c, paths);
                    }
                    break;
                }
            }
        }
    }
}
