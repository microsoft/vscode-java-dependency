// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

/**
 * E2E tests for the Java Projects explorer view.
 *
 * Covers:
 *  - javaProjectExplorer.focus
 *  - java.view.package.linkWithFolderExplorer
 *  - java.view.package.unlinkWithFolderExplorer
 */

import { test, expect } from "../fixtures/baseTest";
import { Timeout, VSCode } from "../utils/constants";
import JavaOperator from "../utils/javaOperator";
import VscodeOperator from "../utils/vscodeOperator";

test.describe("Project Explorer", () => {

    test.use({ testProjectDir: "maven" });

    test.beforeEach(async ({ page }) => {
        await VscodeOperator.dismissModalDialog(page);
        // Open a Java file so the language server activates
        await JavaOperator.openFile(page, "App.java");
        await JavaOperator.waitForJavaLSReady(page);
        await JavaOperator.focusJavaProjects(page);
    });

    test("javaProjectExplorer.focus shows Java Projects section", async ({ page }) => {
        await VscodeOperator.executeCommand(page, "javaProjectExplorer.focus");
        // The section should be visible
        const found = await VscodeOperator.waitForTreeItem(page, "my-app", 15_000);
        expect(found).toBeTruthy();
    });

    test("linkWithFolderExplorer reveals active file in tree", async ({ page }) => {
        // Expand project to source level
        await JavaOperator.expandTreePath(page, "my-app", "src/main/java");

        // The package node should expand and reveal the class
        const packageVisible = await VscodeOperator.waitForTreeItem(page, "com.mycompany.app", 15_000);
        expect(packageVisible).toBeTruthy();

        const classVisible = await VscodeOperator.isTreeItemVisible(page, "App");
        expect(classVisible).toBeTruthy();
    });

    test("unlinkWithFolderExplorer stops auto-reveal", async ({ page }) => {
        // Use command to unlink
        await VscodeOperator.executeCommand(page, "java.view.package.unLinkWithFolderExplorer");
        await page.waitForTimeout(Timeout.CLICK);

        // Open a different file — tree should NOT auto-expand
        await JavaOperator.openFile(page, "AppToRename.java");
        await page.waitForTimeout(Timeout.TREE_EXPAND);

        // Re-link for cleanup
        await VscodeOperator.executeCommand(page, "java.view.package.linkWithFolderExplorer");
    });
});
