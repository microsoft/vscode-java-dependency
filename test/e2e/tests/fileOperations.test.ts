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

        // Right-click AppToRename to select it AND open the context menu.
        // We do NOT left-click first because that opens the file in the editor
        // and steals focus away from the tree view.
        const appToRename = page.getByRole(VSCode.TREE_ITEM_ROLE, { name: "AppToRename" }).first();
        await VscodeOperator.selectContextMenuItem(page, appToRename, /^Rename/);

        // The extension shows a showInputBox (quick-input) for the new name
        await VscodeOperator.fillQuickInput(page, "AppRenamed");

        // Handle extension's own rename confirmation dialog if it appears.
        // The Electron native refactoring dialog from redhat.java is
        // auto-dismissed by the showMessageBox monkey-patch in baseTest.ts.
        try {
            await VscodeOperator.clickDialogButton(page, "OK", 5_000);
        } catch {
            // Dialog may not appear in all cases
        }

        // On Linux, if the refactoring dialog resolved to "Show Preview",
        // VS Code shows a Refactor Preview panel with "Apply" / "Discard"
        // buttons. Click "Apply" to complete the rename.
        try {
            const applyBtn = page.getByRole(VSCode.BUTTON_ROLE, { name: "Apply" });
            if (await applyBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
                await applyBtn.click();
                await page.waitForTimeout(Timeout.CLICK);
            }
        } catch {
            // No refactor preview
        }

        // Editor should open with renamed file
        const tabFound = await VscodeOperator.waitForEditorTab(page, "AppRenamed.java");
        expect(tabFound).toBeTruthy();
    });

    test("delete Java file", async ({ page }) => {
        await JavaOperator.collapseFileExplorer(page);
        await JavaOperator.expandTreePath(page, "my-app", "src/main/java", "com.mycompany.app");

        // Right-click AppToDelete directly (no left-click to avoid opening
        // the file and losing tree focus).
        const appToDelete = page.getByRole(VSCode.TREE_ITEM_ROLE, { name: "AppToDelete" }).first();
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
