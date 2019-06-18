// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, Disposable, FileSystemWatcher, workspace } from "vscode";
import { instrumentOperation } from "vscode-extension-telemetry-wrapper";
import { Commands } from "./commands";

export class SyncHandler {

    public static updateFileWatcher(autoRefresh: boolean): void {
        if (autoRefresh) {
            instrumentOperation(SyncHandler.ENABLE_AUTO_REFRESH, () => this.enableAutoRefresh());
        } else {
            instrumentOperation(SyncHandler.DISABLE_AUTO_REFRESH, () => this.disableAutoRefresh());
        }
    }

    private static javaFileContentWatcher: Disposable = null;

    private static javaFileSystemWatcher: FileSystemWatcher = null;

    private static ENABLE_AUTO_REFRESH = "java.view.package.enableAutoRefresh";

    private static DISABLE_AUTO_REFRESH = "java.view.package.disableAutoRefresh";

    private static enableAutoRefresh() {
        SyncHandler.javaFileContentWatcher = workspace.onDidChangeTextDocument((event) => {
            if (event.document.languageId === "java") {
                SyncHandler.refresh();
            }
        });
        SyncHandler.javaFileSystemWatcher = workspace.createFileSystemWatcher("**/*.{java}");
        SyncHandler.javaFileSystemWatcher.onDidChange(SyncHandler.refresh);
        SyncHandler.javaFileSystemWatcher.onDidCreate(SyncHandler.refresh);
        SyncHandler.javaFileSystemWatcher.onDidDelete(SyncHandler.refresh);
    }

    private static disableAutoRefresh() {
        if (SyncHandler.javaFileContentWatcher) {
            SyncHandler.javaFileContentWatcher.dispose();
        }
        if (SyncHandler.javaFileSystemWatcher) {
            SyncHandler.javaFileSystemWatcher.dispose();
        }
    }

    private static refresh(): void {
        commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH);
    }
}
