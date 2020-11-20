// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as vscode from "vscode";

// tslint:disable: only-arrow-functions
// Defines a Mocha test suite to group tests of similar kind together
suite("Extension Tests", () => {

    test("Extension should be present", () => {
        assert.ok(vscode.extensions.getExtension("vscjava.vscode-java-dependency"));
    });

    test("should activate", async function() {
        const _api = await vscode.extensions.getExtension("vscjava.vscode-java-dependency")!.activate();
        assert.ok(true);
    });
});
