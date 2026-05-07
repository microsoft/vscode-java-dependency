// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as fse from "fs-extra";
import * as path from "path";
import { extensions, Uri, workspace } from "vscode";
import { contextManager } from "../../extension.bundle";
import { sleep } from "../util";

const PROJECT_MANAGER_ACTIVATED = "java:projectManagerActivated";

// tslint:disable: only-arrow-functions
/**
 * Regression tests for https://github.com/microsoft/vscode-java-dependency/issues/921
 *
 * The "Java Projects" explorer view's visibility is gated by the `java:projectManagerActivated`
 * context. For non-Java Gradle workspaces (e.g. Groovy/Grails) the view used to appear
 * unconditionally, which annoyed users that never write Java. The activation logic now
 * defers setting that context until actual Java content is detected, and reacts when a
 * Java file is added later.
 */
suite("Non-Java Gradle Workspace Activation Tests", () => {

    const workspaceRoot = workspace.workspaceFolders![0].uri.fsPath;
    const generatedJavaFile = path.join(workspaceRoot, "Generated.java");

    suiteSetup(async () => {
        // Make sure no leftover from a previous failed run pollutes the workspace.
        await fse.remove(generatedJavaFile);
        // Activation is auto-triggered by `workspaceContains:build.gradle`, but await it
        // explicitly so the test does not race with the activation function.
        await extensions.getExtension("vscjava.vscode-java-dependency")!.activate();
    });

    suiteTeardown(async () => {
        await fse.remove(generatedJavaFile);
    });

    test("Should not flip projectManagerActivated when the workspace has no Java content", function() {
        const activated = contextManager.getContextValue<boolean>(PROJECT_MANAGER_ACTIVATED);
        assert.notStrictEqual(
            activated,
            true,
            "Java Projects view should stay hidden in a non-Java Gradle workspace (issue #921)",
        );
    });

    test("Should flip projectManagerActivated when a Java source file appears later", async function() {
        this.timeout(20 * 1000);

        // Sanity check: still inactive before the file is created.
        assert.notStrictEqual(
            contextManager.getContextValue<boolean>(PROJECT_MANAGER_ACTIVATED),
            true,
        );

        await fse.outputFile(
            generatedJavaFile,
            "public class Generated { public static void main(String[] args) {} }\n",
        );

        // Wait for the FileSystemWatcher's onDidCreate event to propagate.
        const deadline = Date.now() + 10 * 1000;
        while (contextManager.getContextValue<boolean>(PROJECT_MANAGER_ACTIVATED) !== true
            && Date.now() < deadline) {
            await sleep(200);
        }

        assert.strictEqual(
            contextManager.getContextValue<boolean>(PROJECT_MANAGER_ACTIVATED),
            true,
            "Java Projects view should become visible after a *.java file is created",
        );

        // Sanity: file actually lives where we expect, in case the watcher is reacting to
        // some other event source.
        assert.ok(await fse.pathExists(Uri.file(generatedJavaFile).fsPath));
    });
});
