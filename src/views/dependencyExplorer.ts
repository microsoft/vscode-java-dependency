// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from "fs-extra";
import * as path from "path";
import { commands, Disposable, ExtensionContext, TextEditor, TreeView, TreeViewVisibilityChangeEvent, Uri, window } from "vscode";
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { Commands } from "../commands";
import { Build } from "../constants";
import { deleteFiles } from "../explorerCommands/delete";
import { renameFile } from "../explorerCommands/rename";
import { getCmdNode } from "../explorerCommands/utility";
import { Jdtls } from "../java/jdtls";
import { INodeData } from "../java/nodeData";
import { languageServerApiManager } from "../languageServerApi/languageServerApiManager";
import { Settings } from "../settings";
import { DataNode } from "./dataNode";
import { DependencyDataProvider } from "./dependencyDataProvider";
import { ExplorerNode } from "./explorerNode";
import { explorerNodeCache } from "./nodeCache/explorerNodeCache";

export class DependencyExplorer implements Disposable {

    public static getInstance(context: ExtensionContext): DependencyExplorer {
        if (!this._instance) {
            this._instance = new DependencyExplorer(context);
        }
        return this._instance;
    }

    private static _instance: DependencyExplorer;

    private _dependencyViewer: TreeView<ExplorerNode>;

    private _dataProvider: DependencyDataProvider;

    private readonly SUPPORTED_URI_SCHEMES: string[] = ["file", "jdt"];

    constructor(public readonly context: ExtensionContext) {
        this._dataProvider = new DependencyDataProvider(context);
        this._dependencyViewer = window.createTreeView("javaProjectExplorer", { treeDataProvider: this._dataProvider, showCollapseAll: true });

        context.subscriptions.push(
            window.onDidChangeActiveTextEditor((textEditor: TextEditor) => {
                if (this._dependencyViewer.visible && textEditor && textEditor.document && Settings.syncWithFolderExplorer()) {
                    const uri: Uri = textEditor.document.uri;
                    if (this.SUPPORTED_URI_SCHEMES.includes(uri.scheme)) {
                        this.reveal(uri);
                    }
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
                let fsPath: string = uri.fsPath;
                const fileName: string = path.basename(fsPath);
                if (Build.FILE_NAMES.includes(fileName)) {
                    fsPath = path.dirname(fsPath);
                }

                uri = Uri.file(fsPath);
                if ((await fse.stat(fsPath)).isFile()) {
                    await commands.executeCommand(Commands.VIEW_PACKAGE_OPEN_FILE, uri);
                }

                this.reveal(uri);
            }),
        );

        // register keybinding commands
        context.subscriptions.push(
            instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_REVEAL_FILE_OS, (node?: DataNode) => {
                const cmdNode = getCmdNode(this._dependencyViewer.selection[0], node);
                if (cmdNode.uri) {
                    commands.executeCommand("revealFileInOS", Uri.parse(cmdNode.uri));
                }
            }),
        );

        context.subscriptions.push(
            instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_COPY_FILE_PATH, (node?: DataNode) => {
                const cmdNode = getCmdNode(this._dependencyViewer.selection[0], node);
                if (cmdNode.uri) {
                    commands.executeCommand("copyFilePath", Uri.parse(cmdNode.uri));
                }
            }),
        );

        context.subscriptions.push(
            instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_COPY_RELATIVE_FILE_PATH, (node?: DataNode) => {
                const cmdNode = getCmdNode(this._dependencyViewer.selection[0], node);
                if (cmdNode.uri) {
                    commands.executeCommand("copyRelativeFilePath", Uri.parse(cmdNode.uri));
                }
            }),
        );

        context.subscriptions.push(
            instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_RENAME_FILE, (node?: DataNode) => {
                renameFile(getCmdNode(this._dependencyViewer.selection[0], node));
            }),
        );

        context.subscriptions.push(
            instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_MOVE_FILE_TO_TRASH, (node?: DataNode) => {
                deleteFiles(getCmdNode(this._dependencyViewer.selection[0], node));
            }),
        );
    }

    public dispose(): void {
        if (this._dependencyViewer) {
            this._dependencyViewer.dispose();
        }
    }

    public async reveal(uri: Uri): Promise<void> {
        if (!await languageServerApiManager.isStandardServerReady()) {
            return;
        }

        let node: DataNode | undefined = explorerNodeCache.getDataNode(uri);
        if (!node) {
            const paths: INodeData[] | undefined = await Jdtls.resolvePath(uri.toString());
            if (!paths || paths.length === 0) {
                return;
            }
            node = await this._dataProvider.revealPaths(paths);
        }

        if (node && this._dependencyViewer.visible) {
            this._dependencyViewer.reveal(node);
        }
    }

    public get dataProvider(): DependencyDataProvider {
        return this._dataProvider;
    }
}
