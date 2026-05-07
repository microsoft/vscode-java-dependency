// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as vscode from "vscode";
import { contextManager } from "../../extension.bundle";

// tslint:disable: only-arrow-functions
// Defines a Mocha test suite to group tests of similar kind together
suite("Extension Tests", () => {

    test("Extension should be present", () => {
        assert.ok(vscode.extensions.getExtension("vscjava.vscode-java-dependency"));
    });

    test("should activate", async function() {
        await vscode.extensions.getExtension("vscjava.vscode-java-dependency")!.activate();
        assert.ok(true);
    });

    test("Should flip projectManagerActivated when the workspace contains Java content", async function() {
        await vscode.extensions.getExtension("vscjava.vscode-java-dependency")!.activate();
        // The general suite runs against `test/java9`, which contains *.java sources, so the
        // explorer-visibility context must be set. Guards against regressions of issue #921 in
        // the opposite direction (i.e. the view erroneously hidden for real Java workspaces).
        assert.strictEqual(
            contextManager.getContextValue<boolean>("java:projectManagerActivated"),
            true,
        );
    });
});
