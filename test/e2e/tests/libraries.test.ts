// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

/**
 * E2E tests for library management and project creation.
 *
 * Covers:
 *  - java.project.addLibraries
 *  - java.project.addLibraryFolders
 *  - java.project.create
 */

import { test } from "../fixtures/baseTest";

test.describe("Libraries & Project Creation", () => {

    test.describe("invisible project library management", () => {

        test.use({ testProjectDir: "invisible" });

        test.skip("add and remove JAR library", async () => {
            // Skip: the addLibraries command opens a native OS file dialog
            // (vscode.window.showOpenDialog) which Playwright cannot automate.
            // This test requires Electron dialog mocking support.
        });
    });

    test.describe("create new project", () => {

        test.use({ testProjectDir: "invisible" });

        test.skip("java.project.create with no build tools", async () => {
            // Skip: after selecting "No build tools", scaffoldSimpleProject()
            // calls vscode.window.showOpenDialog() which opens a native OS file
            // dialog that Playwright cannot automate. This test requires
            // Electron dialog mocking support.
        });
    });
});
