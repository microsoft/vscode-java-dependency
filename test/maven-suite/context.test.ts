// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import * as assert from "assert";
import { Diagnostic, DiagnosticSeverity, languages, Position, Range, Uri, window } from "vscode";
import { contextManager } from "../../extension.bundle";
import { setupTestEnv, Uris } from "../shared";
import { sleep } from "../util";

// tslint:disable: only-arrow-functions
suite("Context Manager Tests", () => {

    suiteSetup(setupTestEnv);

    test("Can set reload project context correctly", async function() {
        assert.strictEqual(!!contextManager.getContextValue("java:reloadProjectActive"), false);

        const pomUri = Uri.file(path.join(Uris.MAVEN_PROJECT_NODE, "pom.xml"));
        await window.showTextDocument(pomUri);
        assert.strictEqual(!!contextManager.getContextValue("java:reloadProjectActive"), false);

        const collection = languages.createDiagnosticCollection("test-collection");
        collection.set(pomUri, [new Diagnostic(
            new Range(new Position(0, 0), new Position(0, 0)),
            "The build file has been changed and may need reload to make it effective.",
            DiagnosticSeverity.Information
        )]);
        await sleep(1000);
        assert.strictEqual(!!contextManager.getContextValue("java:reloadProjectActive"), true);

        await window.showTextDocument(Uri.file(Uris.MAVEN_MAIN_CLASS));
        assert.strictEqual(!!contextManager.getContextValue("java:reloadProjectActive"), false);
    });
});
