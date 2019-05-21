// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Disposable, workspace, commands, FileSystemWatcher } from "vscode";
import { Commands } from "./commands";

export class SyncHandler {

    private static javaFileContentWatcher: Disposable = null;

    private static javaFileSystemWatcher: FileSystemWatcher = null;

    public static updateFileWatcher(autoRefresh: boolean): void {
        if (autoRefresh) {
            SyncHandler.javaFileContentWatcher = workspace.onDidChangeTextDocument((event) => {
                if (event.document.languageId === 'java') {
                    SyncHandler.refresh();
                }
            });
            SyncHandler.javaFileSystemWatcher = workspace.createFileSystemWatcher('**/*.{java}');
            SyncHandler.javaFileSystemWatcher.onDidChange(SyncHandler.refresh);
            SyncHandler.javaFileSystemWatcher.onDidCreate(SyncHandler.refresh);
            SyncHandler.javaFileSystemWatcher.onDidDelete(SyncHandler.refresh);
        } else {
            if (SyncHandler.javaFileContentWatcher) {
                SyncHandler.javaFileContentWatcher.dispose();
            }
            if (SyncHandler.javaFileSystemWatcher) {
                SyncHandler.javaFileSystemWatcher.dispose();
            }
        }
    }

    private static refresh(): void {
        commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH);
    }
}