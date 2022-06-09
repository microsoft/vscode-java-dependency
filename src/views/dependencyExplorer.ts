// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import AwaitLock from "await-lock";
import * as fse from "fs-extra";
import * as _ from "lodash";
import * as path from "path";
import {
    commands, Disposable, ExtensionContext, QuickPickItem, TextEditor, TreeView,
    TreeViewExpansionEvent, TreeViewSelectionChangeEvent, TreeViewVisibilityChangeEvent, Uri, window,
} from "vscode";
import { instrumentOperationAsVsCodeCommand, sendInfo } from "vscode-extension-telemetry-wrapper";
import { Commands } from "../commands";
import { deleteFiles } from "../explorerCommands/delete";
import { newJavaClass, newPackage } from "../explorerCommands/new";
import { renameFile } from "../explorerCommands/rename";
import { getCmdNode } from "../explorerCommands/utility";
import { Jdtls } from "../java/jdtls";
import { INodeData } from "../java/nodeData";
import { Settings } from "../settings";
import { EventCounter, Utility } from "../utility";
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

    private _revealLock: AwaitLock;

    constructor(public readonly context: ExtensionContext) {
        this._dataProvider = new DependencyDataProvider(context);
        this._dependencyViewer = window.createTreeView("javaProjectExplorer", { treeDataProvider: this._dataProvider, showCollapseAll: true });
        this._revealLock = new AwaitLock();

        // register reveal events
        context.subscriptions.push(
            window.onDidChangeActiveTextEditor((textEditor: TextEditor | undefined) => {
                if (this._dependencyViewer.visible && textEditor?.document) {
                    const uri: Uri = textEditor.document.uri;
                    this.reveal(uri);
                }
            }),
            this._dependencyViewer.onDidChangeVisibility((e: TreeViewVisibilityChangeEvent) => {
                if (e.visible) {
                    sendInfo("", { projectManagerVisible: 1 });
                    if (window.activeTextEditor) {
                        this.reveal(window.activeTextEditor.document.uri);
                    }
                }
            }),
            this._dataProvider.onDidChangeTreeData(() => {
                if (this._dependencyViewer.visible && window.activeTextEditor) {
                    this.reveal(window.activeTextEditor.document.uri);
                }
            }),
            instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_REVEAL_IN_PROJECT_EXPLORER, async (uri: Uri) => {
                await commands.executeCommand(Commands.JAVA_PROJECT_EXPLORER_FOCUS);
                let fsPath: string = uri.fsPath;
                const fileName: string = path.basename(fsPath);
                if (/(.*\.gradle)|(.*\.gradle\.kts)|(pom\.xml)$/.test(fileName)) {
                    fsPath = path.dirname(fsPath);
                }
                uri = Uri.file(fsPath);
                if ((await fse.stat(fsPath)).isFile()) {
                    await commands.executeCommand(Commands.VSCODE_OPEN, uri, { preserveFocus: true });
                }

                this.reveal(uri, false /*force to reveal even the sync setting is turned off*/);
            }),
        );

        // register telemetry events
        context.subscriptions.push(
            this._dependencyViewer.onDidChangeSelection((_e: TreeViewSelectionChangeEvent<ExplorerNode>) => {
                EventCounter.increase("didChangeSelection");
            }),
            this._dependencyViewer.onDidCollapseElement((_e: TreeViewExpansionEvent<ExplorerNode>) => {
                EventCounter.increase("didCollapseElement");
            }),
            this._dependencyViewer.onDidExpandElement((_e: TreeViewExpansionEvent<ExplorerNode>) => {
                EventCounter.increase("didExpandElement");
            }),
        );

        // register keybinding commands
        context.subscriptions.push(
            instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_NEW_JAVA_CLASS, async (node?: DataNode) => {
                newJavaClass(node);
            }),
            instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_NEW_JAVA_PACKAGE, async (node?: DataNode) => {
                let cmdNode = getCmdNode(this._dependencyViewer.selection, node);
                if (!cmdNode) {
                    cmdNode = await this.promptForProjectNode();
                }
                newPackage(cmdNode);
            }),
            instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_REVEAL_FILE_OS, (node?: DataNode) => {
                const cmdNode = getCmdNode(this._dependencyViewer.selection, node);
                if (cmdNode?.uri) {
                    commands.executeCommand("revealFileInOS", Uri.parse(cmdNode.uri));
                }
            }),
            instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_COPY_FILE_PATH, (node?: DataNode) => {
                const cmdNode = getCmdNode(this._dependencyViewer.selection, node);
                if (cmdNode?.uri) {
                    commands.executeCommand("copyFilePath", Uri.parse(cmdNode.uri));
                }
            }),
            instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_COPY_RELATIVE_FILE_PATH, (node?: DataNode) => {
                const cmdNode = getCmdNode(this._dependencyViewer.selection, node);
                if (cmdNode?.uri) {
                    commands.executeCommand("copyRelativeFilePath", Uri.parse(cmdNode.uri));
                }
            }),
            instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_RENAME_FILE, (node?: DataNode) => {
                renameFile(getCmdNode(this._dependencyViewer.selection, node));
            }),
            instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_MOVE_FILE_TO_TRASH, (node?: DataNode) => {
                deleteFiles(getCmdNode(this._dependencyViewer.selection, node), true);
            }),
            instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_DELETE_FILE_PERMANENTLY, (node?: DataNode) => {
                deleteFiles(getCmdNode(this._dependencyViewer.selection, node), false);
            }),
        );
    }

    public dispose(): void {
        if (this._dependencyViewer) {
            this._dependencyViewer.dispose();
        }
    }

    public async reveal(uri: Uri, needCheckSyncSetting: boolean = true): Promise<void> {
        try {
            await this._revealLock.acquireAsync();
            if (needCheckSyncSetting && !Settings.syncWithFolderExplorer()) {
                return;
            }

            if (!await Utility.isRevealable(uri)) {
                return;
            }

            let node: DataNode | undefined = explorerNodeCache.getDataNode(uri);
            if (!node) {
                const paths: INodeData[] = await Jdtls.resolvePath(uri.toString());
                if (!_.isEmpty(paths)) {
                    node = await this._dataProvider.revealPaths(paths);
                }
            }

            if (!node) {
                return;
            }

            await this._dependencyViewer.reveal(node);
        } finally {
            this._revealLock.release();
        }
    }

    public get dataProvider(): DependencyDataProvider {
        return this._dataProvider;
    }

    private async promptForProjectNode(): Promise<DataNode | undefined> {
        const projects = await this._dataProvider.getRootProjects();
        if (projects.length === 0) {
            window.showInformationMessage("There is no Java projects in current workspace.");
            return undefined;
        } else if (projects.length === 1) {
            return projects[0] as DataNode;
        } else {
            const options: IProjectPickItem[] = projects.map((p: DataNode) => {
                return {
                    label: p.name,
                    node: p,
                };
            });
            const choice: IProjectPickItem | undefined = await window.showQuickPick(options, {
                placeHolder: "Choose a project",
                ignoreFocusOut: true,
            });

            return choice?.node as DataNode;
        }
    }
}

interface IProjectPickItem extends QuickPickItem {
    node: ExplorerNode;
}
