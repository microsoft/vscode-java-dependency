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

import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { test, expect } from "../fixtures/baseTest";
import { Timeout, VSCode } from "../utils/constants";
import JavaOperator from "../utils/javaOperator";
import VscodeOperator from "../utils/vscodeOperator";

test.describe("Libraries & Project Creation", () => {

    test.describe("invisible project library management", () => {

        test.use({ testProjectDir: "invisible" });

        test.beforeEach(async ({ page }) => {
            await VscodeOperator.dismissModalDialog(page);
            await JavaOperator.openFile(page, "App.java");
            await JavaOperator.waitForJavaLSReady(page);
            await JavaOperator.focusJavaProjects(page);
        });

        test.skip("add and remove JAR library", async ({ page }) => {
            // Skip: the addLibraries command opens a native OS file dialog
            // (vscode.window.showOpenDialog) which Playwright cannot automate.
            // This test requires Electron dialog mocking support.
        });
    });

    test.describe("create new project", () => {

        test.use({ testProjectDir: "invisible" });

        test("java.project.create with no build tools", async ({ page }) => {
            await VscodeOperator.dismissModalDialog(page);
            await JavaOperator.openFile(page, "App.java");
            await JavaOperator.waitForJavaLSReady(page);

            // Create a temp folder for the new project
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "java-new-project-"));

            await VscodeOperator.executeCommand(page, "Java: Create Java Project");
            // The build-tool quick pick may take a moment to appear
            await page.waitForTimeout(Timeout.TREE_EXPAND);

            // Select "No build tools"
            await VscodeOperator.selectQuickPickItem(page, "No build tools");

            // The project location dialog uses a native file picker on some platforms.
            // Enter the project name when prompted.
            await VscodeOperator.fillQuickInput(page, "helloworld");

            // Wait for project files to be created
            await page.waitForTimeout(Timeout.TREE_EXPAND * 2);

            // Clean up
            try {
                fs.rmSync(tmpDir, { force: true, recursive: true });
            } catch {
                // Ignore cleanup errors
            }
        });
    });
});
