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

        test("add and remove JAR library", async ({ page }) => {
            // Expand to Referenced Libraries
            await JavaOperator.expandTreePath(page, "invisible", "Referenced Libraries");

            // Click the add button on Referenced Libraries
            await VscodeOperator.clickTreeItemAction(
                page,
                "Referenced Libraries",
                "Add Jar Libraries to Project Classpath"
            );

            // Type the jar path in the input
            const testRoot = path.join(__dirname, "..", "..", "..");
            const jarPath = path.join(testRoot, "test", "invisible", "libSource", "simple.jar");
            await VscodeOperator.fillQuickInput(page, jarPath);

            // Wait for tree to update and verify the jar appears
            const added = await VscodeOperator.waitForTreeItem(page, "simple.jar", 15_000);
            expect(added).toBeTruthy();

            // Now remove it
            await VscodeOperator.clickTreeItem(page, "simple.jar");
            await VscodeOperator.clickTreeItemAction(page, "simple.jar", "Remove from Project Classpath");

            const gone = await VscodeOperator.waitForTreeItemGone(page, "simple.jar");
            expect(gone).toBeTruthy();
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
            await page.waitForTimeout(Timeout.CLICK);

            // Select "No build tools"
            await VscodeOperator.selectQuickPickItem(page, "No build tools");

            // Enter the project location
            await VscodeOperator.fillQuickInput(page, tmpDir);

            // Enter the project name
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
