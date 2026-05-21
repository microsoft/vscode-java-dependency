// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from "fs-extra";
import * as _ from "lodash";
import * as minimatch from "minimatch";
import { platform } from "os";
import * as path from "path";
import { Disposable, ExtensionContext, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { Commands } from "../commands";
import { Jdtls } from "../java/jdtls";
import { Settings } from "../settings";
import { Utility } from "../utility";
import { DataNode } from "../views/dataNode";

export const WORKSPACE_FOLDER_VARIABLE = "$" + "{workspaceFolder}";

export class LibraryController implements Disposable {

    private disposable: Disposable;

    public constructor(public readonly context: ExtensionContext) {
        this.disposable = Disposable.from(
            instrumentOperationAsVsCodeCommand(Commands.JAVA_PROJECT_ADD_LIBRARIES, () => this.addLibraries()),
            instrumentOperationAsVsCodeCommand(Commands.JAVA_PROJECT_ADD_LIBRARY_FOLDERS, () => this.addLibraries(true)),
            instrumentOperationAsVsCodeCommand(Commands.JAVA_PROJECT_REMOVE_LIBRARY, (node: DataNode) =>
                node.uri && this.removeLibrary(Uri.parse(node.uri).fsPath)),
            instrumentOperationAsVsCodeCommand(Commands.JAVA_PROJECT_REFRESH_LIBRARIES, () =>
                this.refreshLibraries()),
        );
    }

    public dispose() {
        this.disposable.dispose();
    }

    public async addLibraries(canSelectFolders?: boolean) {
        const workspaceFolder: WorkspaceFolder | undefined = Utility.getDefaultWorkspaceFolder();
        const isMac = platform() === "darwin";
        const results: Uri[] | undefined = await window.showOpenDialog({
            defaultUri: workspaceFolder && workspaceFolder.uri,
            canSelectFiles: !canSelectFolders,
            canSelectFolders: canSelectFolders || isMac,
            canSelectMany: true,
            openLabel: canSelectFolders ? "Select Library Folders" : "Select Jar Libraries",
            filters: canSelectFolders ? { Folders: ["*"] } : { "Jar Files": ["jar"] },
        });
        if (!results) {
            return;
        }
        addLibraryGlobs(await Promise.all(results.map(async (uri: Uri) => {
            const uriPath = toReferencedLibraryPath(uri, workspaceFolder);
            const isLibraryFolder = canSelectFolders || isMac && (await fse.stat(uri.fsPath)).isDirectory();
            return isLibraryFolder ? uriPath + "/**/*.jar" : uriPath;
        })));
    }

    public async removeLibrary(removalFsPath: string) {
        const workspaceFolder: WorkspaceFolder | undefined = Utility.getDefaultWorkspaceFolder();
        const removalUri = Uri.file(removalFsPath);
        const setting = Settings.referencedLibraries();
        const removedPaths = _.remove(setting.include, (include) => {
            if (path.isAbsolute(include)) {
                return Uri.file(include).fsPath === removalFsPath;
            } else {
                return include === workspace.asRelativePath(removalFsPath, false)
                    || include === toReferencedLibraryPath(removalUri, workspaceFolder);
            }
        });
        if (removedPaths.length === 0) {
            // No duplicated item in include array, add it into the exclude field
            setting.exclude = updatePatternArray(setting.exclude, toReferencedLibraryPath(removalUri, workspaceFolder));
        }
        Settings.updateReferencedLibraries(setting);
    }

    public async refreshLibraries(): Promise<void> {
        const workspaceFolder = Utility.getDefaultWorkspaceFolder();
        if (workspaceFolder) {
            await Jdtls.refreshLibraries(workspaceFolder.uri.toString());
        }
    }
}

export function addLibraryGlobs(libraryGlobs: string[]) {
    const setting = Settings.referencedLibraries();
    setting.exclude = dedupAlreadyCoveredPattern(libraryGlobs, ...setting.exclude);
    setting.include = updatePatternArray(setting.include, ...libraryGlobs);
    Settings.updateReferencedLibraries(setting);
}

export function toReferencedLibraryPath(uri: Uri, workspaceFolder: WorkspaceFolder | undefined): string {
    if (!workspaceFolder) {
        return uri.fsPath;
    }

    const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
    if (relativePath === ".." || relativePath.startsWith(".." + path.sep) || path.isAbsolute(relativePath)) {
        return uri.fsPath;
    }

    return [WORKSPACE_FOLDER_VARIABLE, relativePath.replace(/\\/g, "/")].filter(Boolean).join("/");
}

/**
 * Check if the `update` patterns are already covered by `origin` patterns and return those uncovered
 */
function dedupAlreadyCoveredPattern(origin: string[], ...update: string[]): string[] {
    return update.filter((newPattern) => {
        return !origin.some((originPattern) => {
            return minimatch(newPattern, originPattern);
        });
    });
}

function updatePatternArray(origin: string[], ...update: string[]): string[] {
    update = dedupAlreadyCoveredPattern(origin, ...update);
    origin.push(...update);
    return _.uniq(origin);
}
