// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

/**
 * Generic VS Code UI helpers built on Playwright Page.
 *
 * All methods use ARIA roles / labels rather than CSS classes so that they
 * survive VS Code version upgrades.
 */

import { Page } from "@playwright/test";
import { Timeout, VSCode } from "./constants";

export default class VscodeOperator {

    // -----------------------------------------------------------------------
    //  Command palette
    // -----------------------------------------------------------------------

    /**
     * Opens the command palette, types the given command, and runs it.
     */
    static async executeCommand(page: Page, command: string): Promise<void> {
        await page.keyboard.press(VSCode.CMD_PALETTE_KEY);
        // Wait for the quick-input widget to appear
        const input = page.locator(".quick-input-widget input.input");
        await input.waitFor({ state: "visible", timeout: 10_000 });
        await input.fill(command);
        await page.waitForTimeout(Timeout.CLICK);
        // Press Enter on the first matching option in the list
        const firstOption = page.locator(".quick-input-widget .quick-input-list .monaco-list-row").first();
        if (await firstOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await firstOption.click();
        } else {
            await input.press(VSCode.ENTER);
        }
        await page.waitForTimeout(Timeout.CLICK);
    }

    /**
     * Select a quick-pick option by its visible label text.
     */
    static async selectQuickPickItem(page: Page, label: string): Promise<void> {
        const option = page.locator(".quick-input-widget .quick-input-list .monaco-list-row", { hasText: label });
        await option.first().waitFor({ state: "visible", timeout: 10_000 });
        await option.first().click();
        await page.waitForTimeout(Timeout.CLICK);
    }

    /**
     * Select a quick-pick option by its zero-based index.
     */
    static async selectQuickPickIndex(page: Page, index: number): Promise<void> {
        const option = page.locator(".quick-input-widget .quick-input-list .monaco-list-row").nth(index);
        await option.waitFor({ state: "visible", timeout: 10_000 });
        await option.click();
        await page.waitForTimeout(Timeout.CLICK);
    }

    // -----------------------------------------------------------------------
    //  Quick input box
    // -----------------------------------------------------------------------

    /**
     * Waits for the quick-input box to appear and returns the input locator.
     */
    static async getQuickInput(page: Page): Promise<ReturnType<Page["locator"]>> {
        const input = page.locator(".quick-input-widget input.input");
        await input.waitFor({ state: "visible", timeout: 10_000 });
        return input;
    }

    /**
     * Types text into the quick-input and confirms with Enter.
     */
    static async fillQuickInput(page: Page, text: string): Promise<void> {
        const input = await VscodeOperator.getQuickInput(page);
        await input.fill(text);
        await page.waitForTimeout(Timeout.CLICK);
        await input.press(VSCode.ENTER);
        await page.waitForTimeout(Timeout.CLICK);
    }

    // -----------------------------------------------------------------------
    //  Side bar / Activity bar
    // -----------------------------------------------------------------------

    /**
     * Clicks a side-bar tab by its accessibility label (e.g. "Explorer", "Java Projects").
     */
    static async activateSideTab(page: Page, tabName: string, timeout = Timeout.CLICK): Promise<void> {
        await page.getByRole(VSCode.TAB_ROLE, { name: tabName }).locator(VSCode.LINK).click();
        await page.waitForTimeout(timeout);
    }

    static async isSideTabVisible(page: Page, tabName: string): Promise<boolean> {
        return page.getByRole(VSCode.TAB_ROLE, { name: tabName }).isVisible();
    }

    // -----------------------------------------------------------------------
    //  Tree items
    // -----------------------------------------------------------------------

    /**
     * Returns whether a tree item with the given name is visible.
     */
    static async isTreeItemVisible(page: Page, name: string): Promise<boolean> {
        return page.getByRole(VSCode.TREE_ITEM_ROLE, { name }).isVisible();
    }

    /**
     * Clicks a tree item by name.
     */
    static async clickTreeItem(page: Page, name: string): Promise<void> {
        await page.getByRole(VSCode.TREE_ITEM_ROLE, { name }).locator(VSCode.LINK).first().click();
        await page.waitForTimeout(Timeout.TREE_EXPAND);
    }

    /**
     * Waits for a tree item to appear in the DOM and become visible.
     * Returns `true` if the item was found within `timeoutMs`.
     */
    static async waitForTreeItem(page: Page, name: string, timeoutMs = 30_000): Promise<boolean> {
        try {
            await page.getByRole(VSCode.TREE_ITEM_ROLE, { name }).first().waitFor({
                state: "visible",
                timeout: timeoutMs,
            });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Waits until a tree item disappears from the view.
     */
    static async waitForTreeItemGone(page: Page, name: string, timeoutMs = 15_000): Promise<boolean> {
        try {
            await page.getByRole(VSCode.TREE_ITEM_ROLE, { name }).first().waitFor({
                state: "hidden",
                timeout: timeoutMs,
            });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Clicks an inline action button on a tree item (the small icons that appear on hover).
     * Uses aria-label matching so it works across VS Code versions.
     */
    static async clickTreeItemAction(page: Page, itemName: string, actionLabel: string): Promise<void> {
        const treeItem = page.getByRole(VSCode.TREE_ITEM_ROLE, { name: itemName });
        // Hover to reveal inline action buttons
        await treeItem.hover();
        await page.waitForTimeout(500);
        await treeItem.locator(`a.action-label[role="button"][aria-label*="${actionLabel}"]`).click();
        await page.waitForTimeout(Timeout.CLICK);
    }

    // -----------------------------------------------------------------------
    //  Dialogs
    // -----------------------------------------------------------------------

    /**
     * Tries to dismiss a modal dialog (workspace-trust, update prompts, etc.)
     * by clicking a button whose label matches one of the well-known accept labels.
     * Silently succeeds if no dialog is present.
     */
    static async dismissModalDialog(page: Page): Promise<void> {
        const acceptLabels = ["Yes, I trust the authors", "OK", "Yes", "Continue", "I Trust the Authors"];
        try {
            // Handle modal dialogs
            const dialog = page.locator(".monaco-dialog-box");
            if (await dialog.isVisible({ timeout: 2_000 }).catch(() => false)) {
                for (const label of acceptLabels) {
                    const btn = dialog.getByRole(VSCode.BUTTON_ROLE, { name: label });
                    if (await btn.isVisible().catch(() => false)) {
                        await btn.click();
                        await page.waitForTimeout(Timeout.CLICK);
                        break;
                    }
                }
            }
        } catch {
            // No modal dialog — nothing to dismiss
        }

        // Also dismiss notification toasts (telemetry prompts, theme suggestions, etc.)
        try {
            const closeButtons = page.locator(".notification-toast .codicon-close");
            let count = await closeButtons.count().catch(() => 0);
            while (count > 0) {
                await closeButtons.first().click();
                await page.waitForTimeout(500);
                count = await closeButtons.count().catch(() => 0);
            }
        } catch {
            // Best effort
        }
    }

    /**
     * Waits for a modal dialog to appear and clicks a button by its label.
     */
    static async clickDialogButton(page: Page, buttonLabel: string, timeoutMs = 10_000): Promise<void> {
        const dialog = page.locator(".monaco-dialog-box");
        await dialog.waitFor({ state: "visible", timeout: timeoutMs });
        await dialog.getByRole(VSCode.BUTTON_ROLE, { name: buttonLabel }).click();
        await page.waitForTimeout(Timeout.CLICK);
    }

    // -----------------------------------------------------------------------
    //  Editor
    // -----------------------------------------------------------------------

    /**
     * Waits for an editor tab with the given title to become active.
     */
    static async waitForEditorTab(page: Page, title: string, timeoutMs = 15_000): Promise<boolean> {
        try {
            await page.getByRole(VSCode.TAB_ROLE, { name: title }).first().waitFor({
                state: "visible",
                timeout: timeoutMs,
            });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Saves the currently active editor using the command palette.
     * (More reliable than Ctrl+S because focus might not be on the editor.)
     */
    static async saveActiveEditor(page: Page): Promise<void> {
        await VscodeOperator.executeCommand(page, "workbench.action.files.save");
    }
}
