// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

/**
 * Java-specific helpers for E2E tests.
 *
 * The most important one is `waitForJavaLSReady()` which polls the status bar
 * until Language Support for Java reports a "ready" state, using Playwright's
 * `expect.poll` so that the test automatically retries and fails cleanly if
 * the LS never reaches readiness.
 */

import { expect, Page } from "@playwright/test";
import { Timeout, VSCode } from "./constants";
import VscodeOperator from "./vscodeOperator";

export default class JavaOperator {

    /**
     * Waits for the Java Language Server to finish indexing.
     *
     * Strategy: poll the status bar for a button whose accessible name
     * contains "Java: Ready" (e.g. "coffee Java: Ready, Show Java status menu").
     * This is more reliable than clicking a hover because it doesn't depend
     * on internal VS Code DOM IDs that vary across versions.
     */
    static async waitForJavaLSReady(page: Page, timeoutMs = Timeout.JAVA_LS_READY): Promise<void> {
        // Give the extension a moment to register its status bar item
        await page.waitForTimeout(Timeout.EXTENSION_ACTIVATE);

        await expect.poll(async () => {
            try {
                const javaReadyButton = page.getByRole(VSCode.BUTTON_ROLE, { name: /Java:\s*Ready/i });
                if (await javaReadyButton.isVisible().catch(() => false)) {
                    return "ready";
                }
                return "not-ready";
            } catch {
                return "not-ready";
            }
        }, {
            message: "Java Language Server did not become ready in time",
            timeout: timeoutMs,
            intervals: [Timeout.JAVA_LS_POLL_INTERVAL],
        }).toBe("ready");
    }

    /**
     * Focuses the Java Projects view and waits for it to render.
     */
    static async focusJavaProjects(page: Page): Promise<void> {
        await VscodeOperator.executeCommand(page, "javaProjectExplorer.focus");
        // Wait a moment for the section to render
        await page.waitForTimeout(Timeout.TREE_EXPAND);
    }

    /**
     * Expands tree items along a path (e.g. "my-app" → "src/main/java" → "com.mycompany.app").
     * Returns the last expanded tree item locator.
     */
    static async expandTreePath(page: Page, ...labels: string[]): Promise<void> {
        for (const label of labels) {
            const item = page.getByRole(VSCode.TREE_ITEM_ROLE, { name: label }).first();
            await item.waitFor({ state: "visible", timeout: 15_000 });
            await item.click();
            await page.waitForTimeout(Timeout.TREE_EXPAND);
        }
    }

    /**
     * Collapses the default file explorer section so that tree items in the
     * Java Projects view are within the viewport.
     */
    static async collapseFileExplorer(page: Page): Promise<void> {
        try {
            // Try to collapse any expanded section above Java Projects
            const sections = page.locator(".split-view-view .pane-header[aria-expanded='true']");
            const count = await sections.count();
            if (count > 0) {
                await sections.first().click();
                await page.waitForTimeout(Timeout.CLICK);
            }
        } catch {
            // Best-effort
        }
    }

    /**
     * Opens a file in the editor via Quick Open (Ctrl+P).
     */
    static async openFile(page: Page, filePath: string): Promise<void> {
        // Use Ctrl+P directly instead of going through command palette
        await page.keyboard.press("Control+P");
        const input = page.locator(".quick-input-widget input.input");
        await input.waitFor({ state: "visible", timeout: 10_000 });
        await input.fill(filePath);
        await page.waitForTimeout(Timeout.CLICK);
        // Wait for file matches to appear, then select the first one
        const firstMatch = page.locator(".quick-input-widget .quick-input-list .monaco-list-row").first();
        if (await firstMatch.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await firstMatch.click();
        } else {
            await input.press(VSCode.ENTER);
        }
        await page.waitForTimeout(Timeout.TREE_EXPAND);
    }

    /**
     * Triggers the "New..." action on a project node.
     * This opens the resource-type quick-pick.
     */
    static async triggerNewResource(page: Page, projectName: string): Promise<void> {
        await JavaOperator.collapseFileExplorer(page);
        await VscodeOperator.clickTreeItem(page, projectName);
        await VscodeOperator.clickTreeItemAction(page, projectName, "New...");
    }
}
