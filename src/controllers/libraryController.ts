// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from "fs-extra";
import * as _ from "lodash";
import { commands, Disposable, ExtensionContext, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { instrumentOperation } from "vscode-extension-telemetry-wrapper";
import { Commands } from "../commands";
import { Jdtls } from "../java/jdtls";
import { Settings } from "../settings";
import { Utility } from "../utility";
import { DataNode } from "../views/dataNode";

export class LibraryController implements Disposable {

    private disposable: Disposable;

    public constructor(public readonly context: ExtensionContext) {
        this.disposable = Disposable.from(
            commands.registerCommand(Commands.JAVA_PROJECT_ADD_LIBRARIES,
                instrumentOperation(Commands.JAVA_PROJECT_ADD_LIBRARIES, (operationId: string, node: DataNode) => this.addLibraries())),
            commands.registerCommand(Commands.JAVA_PROJECT_REMOVE_LIBRARY,
                instrumentOperation(Commands.JAVA_PROJECT_REMOVE_LIBRARY, (operationId: string, node: DataNode) => this.removeLibrary(node.path))),
            commands.registerCommand(Commands.JAVA_PROJECT_REFRESH_LIBRARIES,
                instrumentOperation(Commands.JAVA_PROJECT_REFRESH_LIBRARIES, (operationId: string, node: DataNode) => this.refreshLibraries())),
        );
    }

    public dispose() {
        this.disposable.dispose();
    }

    public async addLibraries(libraryGlobs?: string[]) {
        if (!libraryGlobs) {
            libraryGlobs = [];
            const workspaceFolder: WorkspaceFolder | undefined = Utility.getDefaultWorkspaceFolder();
            const results: Uri[] | undefined = await window.showOpenDialog({
                defaultUri: workspaceFolder && workspaceFolder.uri,
                canSelectFiles: true,
                canSelectFolders: true,
                canSelectMany: true,
                openLabel: "Select a jar file or directory to the project classpath",
            });
            if (!results) {
                return;
            }
            libraryGlobs = await Promise.all(results.map(async (uri: Uri) => {
                const uriPath = workspace.asRelativePath(uri, false);
                return (await fse.stat(uri.fsPath)).isDirectory() ? `${uriPath}/**/*.jar` : uriPath;
            }));
        }
        const setting = Settings.referencedLibraries();
        setting.include.push(...libraryGlobs);
        Settings.updateReferencedLibraries(setting);
    }

    public async removeLibrary(library: string) {
        const setting = Settings.referencedLibraries();
        setting.exclude.push(workspace.asRelativePath(library));
        Settings.updateReferencedLibraries(setting);
    }

    public async refreshLibraries(): Promise<void> {
        const workspaceFolder = Utility.getDefaultWorkspaceFolder();
        if (workspaceFolder) {
            await Jdtls.refreshLibraries(workspaceFolder.uri.toString());
        }
    }
}
