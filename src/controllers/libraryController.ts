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
            instrumentOperationAsVsCodeCommand(Commands.JAVA_COMMAND_GET_IMPORT_CLASS_CONTENT, async (uri: string)=>  {
                console.log('=============== JAVA_COMMAND_GET_IMPORT_CLASS_CONTENT =================');
                await Jdtls.getImportClassContent(uri)
            }),
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
            // keep the param: `includeWorkspaceFolder` to false here
            // since the multi-root is not supported well for invisible projects
            const uriPath = workspace.asRelativePath(uri, false);
            const isLibraryFolder = canSelectFolders || isMac && (await fse.stat(uri.fsPath)).isDirectory();
            return isLibraryFolder ? uriPath + "/**/*.jar" : uriPath;
        })));
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
            setting.exclude = updatePatternArray(setting.exclude, workspace.asRelativePath(removalFsPath, false));
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
