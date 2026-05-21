// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as path from "path";
import { Uri, workspace } from "vscode";
import { toReferencedLibraryPath, WORKSPACE_FOLDER_VARIABLE } from "../../src/controllers/libraryController";

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
});