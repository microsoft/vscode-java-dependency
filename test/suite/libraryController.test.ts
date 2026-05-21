// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as path from "path";
import { Uri, workspace } from "vscode";
import { toReferencedLibraryExcludePath, toReferencedLibraryPath, WORKSPACE_FOLDER_VARIABLE } from "../../extension.bundle";

suite("Library Controller Tests", () => {

    test("Should use workspace folder variable for workspace-local libraries", () => {
        const workspaceFolder = workspace.workspaceFolders![0];
        const libraryUri = Uri.file(path.join(workspaceFolder.uri.fsPath, "lib", "foo.jar"));

        assert.strictEqual(toReferencedLibraryPath(libraryUri, workspaceFolder), `${WORKSPACE_FOLDER_VARIABLE}/lib/foo.jar`);
    });

    test("Should keep absolute paths for external libraries", () => {
        const workspaceFolder = workspace.workspaceFolders![0];
        const libraryUri = Uri.file(path.resolve(workspaceFolder.uri.fsPath, "..", "foo.jar"));

        assert.strictEqual(toReferencedLibraryPath(libraryUri, workspaceFolder), libraryUri.fsPath);
    });

    test("Should use relative exclude path for relative include patterns", () => {
        const workspaceFolder = workspace.workspaceFolders![0];
        const libraryUri = Uri.file(path.join(workspaceFolder.uri.fsPath, "lib", "foo.jar"));

        assert.strictEqual(toReferencedLibraryExcludePath(libraryUri, workspaceFolder, ["lib/**/*.jar"]), "lib/foo.jar");
    });

    test("Should use workspace folder variable exclude path for workspace folder variable include patterns", () => {
        const workspaceFolder = workspace.workspaceFolders![0];
        const libraryUri = Uri.file(path.join(workspaceFolder.uri.fsPath, "lib", "foo.jar"));
        const include = `${WORKSPACE_FOLDER_VARIABLE}/lib/**/*.jar`;

        assert.strictEqual(toReferencedLibraryExcludePath(libraryUri, workspaceFolder, [include]), `${WORKSPACE_FOLDER_VARIABLE}/lib/foo.jar`);
    });
});
