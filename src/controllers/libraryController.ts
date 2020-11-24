// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from "fs-extra";
import * as _ from "lodash";
import * as minimatch from "minimatch";
import * as path from "path";
import { Disposable, ExtensionContext, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { Commands } from "../commands";
import { Jdtls } from "../java/jdtls";
import { Settings } from "../settings";
import { Utility } from "../utility";
import { DataNode } from "../views/dataNode";

export class LibraryController implements Disposable {

    private disposable: Disposable;

    public constructor(public readonly context: ExtensionContext) {
        this.disposable = Disposable.from(
            instrumentOperationAsVsCodeCommand(Commands.JAVA_PROJECT_ADD_LIBRARIES, () => this.addLibraries()),
            instrumentOperationAsVsCodeCommand(Commands.JAVA_PROJECT_REMOVE_LIBRARY, (node: DataNode) =>
                this.removeLibrary(Uri.parse(node.uri).fsPath)),
            instrumentOperationAsVsCodeCommand(Commands.JAVA_PROJECT_REFRESH_LIBRARIES, () =>
                this.refreshLibraries()),
        );
    }

    public dispose() {
        this.disposable.dispose();
    }

    public async addLibraries(libraryGlobs?: string[]) {
        if (!libraryGlobs) {
            libraryGlobs = [];
            const workspaceFolder: WorkspaceFolder | undefined = Utility.getDefaultWorkspaceFolder();
            const isWindows = process.platform.indexOf("win") === 0;
            const results: Uri[] | undefined = await window.showOpenDialog({
                defaultUri: workspaceFolder && workspaceFolder.uri,
                canSelectFiles: true,
                canSelectFolders: isWindows ? false : true,
                canSelectMany: true,
                openLabel: isWindows ? "Select jar files" : "Select jar files or directories",
                filters: { Library: ["jar"] },
            });
            if (!results) {
                return;
            }
            libraryGlobs = await Promise.all(results.map(async (uri: Uri) => {
                // keep the param: `includeWorkspaceFolder` to false here
                // since the multi-root is not supported well for invisible projects
                const uriPath = workspace.asRelativePath(uri, false);
                return (await fse.stat(uri.fsPath)).isDirectory() ? `${uriPath}/**/*.jar` : uriPath;
            }));
        }

        const setting = Settings.referencedLibraries();
        setting.exclude = this.dedupAlreadyCoveredPattern(libraryGlobs, ...setting.exclude);
        setting.include = this.updatePatternArray(setting.include, ...libraryGlobs);
        Settings.updateReferencedLibraries(setting);
    }

    public async removeLibrary(removalFsPath: string) {
        const setting = Settings.referencedLibraries();
        const removedPaths = _.remove(setting.include, (include) => {
            if (path.isAbsolute(include)) {
                return Uri.file(include).fsPath === removalFsPath;
            } else {
                return include === workspace.asRelativePath(removalFsPath, false);
            }
        });
        if (removedPaths.length === 0) {
            // No duplicated item in include array, add it into the exclude field
            setting.exclude = this.updatePatternArray(setting.exclude, workspace.asRelativePath(removalFsPath, false));
        }
        Settings.updateReferencedLibraries(setting);
    }

    public async refreshLibraries(): Promise<void> {
        const workspaceFolder = Utility.getDefaultWorkspaceFolder();
        if (workspaceFolder) {
            await Jdtls.refreshLibraries(workspaceFolder.uri.toString());
        }
    }

    /**
     * Check if the `update` patterns are already covered by `origin` patterns and return those uncovered
     */
    private dedupAlreadyCoveredPattern(origin: string[], ...update: string[]): string[] {
        return update.filter((newPattern) => {
            return !origin.some((originPattern) => {
                return minimatch(newPattern, originPattern);
            });
        });
    }

    private updatePatternArray(origin: string[], ...update: string[]): string[] {
        update = this.dedupAlreadyCoveredPattern(origin, ...update);
        origin.push(...update);
        return _.uniq(origin);
    }
}
