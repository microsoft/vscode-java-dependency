// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

/**
 * E2E tests for file / resource operations in the Java Projects view.
 *
 * Covers:
 *  - java.view.package.newJavaClass
 *  - java.view.package.newPackage
 *  - java.view.package.renameFile
 *  - java.view.package.moveFileToTrash
 */

import * as fs from "fs-extra";
import * as path from "path";
import { test, expect } from "../fixtures/baseTest";
import { Timeout, VSCode } from "../utils/constants";
import JavaOperator from "../utils/javaOperator";
import VscodeOperator from "../utils/vscodeOperator";

test.describe("File Operations", () => {

    test.use({ testProjectDir: "maven" });

    test.beforeEach(async ({ page }) => {
        await VscodeOperator.dismissModalDialog(page);
        await JavaOperator.openFile(page, "App.java");
        await JavaOperator.waitForJavaLSReady(page);
        await JavaOperator.focusJavaProjects(page);
    });

    test("create new Java class", async ({ page }) => {
        // Trigger New... on the project node
        await JavaOperator.triggerNewResource(page, "my-app");

        // Select "Java Class" (first item)
        await VscodeOperator.selectQuickPickIndex(page, 0);

        // Select source folder "src/main/java"
        await VscodeOperator.selectQuickPickItem(page, "src/main/java");

        // Type class name and confirm
        await VscodeOperator.fillQuickInput(page, "App2");

        // Editor should open with the new file
        const tabFound = await VscodeOperator.waitForEditorTab(page, "App2.java");
        expect(tabFound).toBeTruthy();
    });

    test("create new package", async ({ page }) => {
        await JavaOperator.triggerNewResource(page, "my-app");

        // Select "Package"
        await VscodeOperator.selectQuickPickItem(page, "Package");

        // Select source folder
        await VscodeOperator.selectQuickPickItem(page, "src/main/java");

        // Type package name and confirm
        await VscodeOperator.fillQuickInput(page, "com.mycompany.newpkg");

        // Wait briefly for directory creation
        await page.waitForTimeout(Timeout.TREE_EXPAND);
    });

    test("rename Java file", async ({ page }) => {
        await JavaOperator.collapseFileExplorer(page);

        // Expand to AppToRename
        await JavaOperator.expandTreePath(page, "my-app", "src/main/java", "com.mycompany.app");

        // Select AppToRename in the tree and invoke rename via context menu.
        // The command is hidden from the command palette (when: false)
        // and keyboard shortcut requires focusedView which is unreliable,
        // so context menu is the only reliable UI path.
        const appToRename = page.getByRole(VSCode.TREE_ITEM_ROLE, { name: "AppToRename" }).first();
        await appToRename.click();
        await page.waitForTimeout(Timeout.CLICK);

        await VscodeOperator.selectContextMenuItem(page, appToRename, "Rename");

        // The extension shows a showInputBox (quick-input) for the new name
        await VscodeOperator.fillQuickInput(page, "AppRenamed");

        // Handle confirmation dialog if it appears
        try {
            await VscodeOperator.clickDialogButton(page, "OK", 5_000);
        } catch {
            // Dialog may not appear in all cases
        }

        // Editor should open with renamed file
        const tabFound = await VscodeOperator.waitForEditorTab(page, "AppRenamed.java");
        expect(tabFound).toBeTruthy();
    });

    test("delete Java file", async ({ page }) => {
        await JavaOperator.collapseFileExplorer(page);
        await JavaOperator.expandTreePath(page, "my-app", "src/main/java", "com.mycompany.app");

        // Select AppToDelete and invoke delete via context menu.
        const appToDelete = page.getByRole(VSCode.TREE_ITEM_ROLE, { name: "AppToDelete" }).first();
        await appToDelete.click();
        await page.waitForTimeout(Timeout.CLICK);

        await VscodeOperator.selectContextMenuItem(page, appToDelete, /^Delete/);

        // Confirm deletion in dialog
        try {
            const dialog = page.locator(".monaco-dialog-box");
            await dialog.waitFor({ state: "visible", timeout: 5_000 });
            const confirmBtn = dialog.getByRole(VSCode.BUTTON_ROLE)
                .filter({ hasText: /Move to Trash|Move to Recycle Bin|Delete|OK/ });
            await confirmBtn.first().click();
        } catch {
            // Dialog may not appear
        }

        // Wait for tree item to disappear
        const gone = await VscodeOperator.waitForTreeItemGone(page, "AppToDelete");
        expect(gone).toBeTruthy();
    });
});
