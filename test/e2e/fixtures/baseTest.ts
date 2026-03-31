// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

/**
 * Playwright test fixture that launches VS Code via Electron,
 * opens a temporary copy of a test project, and tears everything
 * down after the test.
 *
 * Usage in test files:
 *
 *   import { test, expect } from "../fixtures/baseTest";
 *
 *   test("my test", async ({ page }) => {
 *       // `page` is a Playwright Page attached to VS Code
 *   });
 */

import { _electron, test as base, type Page } from "@playwright/test";
import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from "@vscode/test-electron";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";

export { expect } from "@playwright/test";

// Root of the extension source tree
const EXTENSION_ROOT = path.join(__dirname, "..", "..", "..");
// Root of the test data projects
const TEST_DATA_ROOT = path.join(EXTENSION_ROOT, "test");

export type TestOptions = {
    /** VS Code version to download, default "stable" */
    vscodeVersion: string;
    /** Relative path under `test/` to the project to open (e.g. "maven") */
    testProjectDir: string;
};

type TestFixtures = TestOptions & {
    /** Playwright Page connected to the VS Code Electron window */
    page: Page;
};

export const test = base.extend<TestFixtures>({
    vscodeVersion: [process.env.VSCODE_VERSION || "stable", { option: true }],
    testProjectDir: ["maven", { option: true }],

    page: async ({ vscodeVersion, testProjectDir }, use, testInfo) => {
        // 1. Create a temp directory and copy the test project into it.
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "java-dep-e2e-"));
        const projectName = path.basename(testProjectDir);
        const projectDir = path.join(tmpDir, projectName);
        fs.copySync(path.join(TEST_DATA_ROOT, testProjectDir), projectDir);

        // Write VS Code settings to suppress telemetry prompts and notification noise
        const vscodeDir = path.join(projectDir, ".vscode");
        fs.ensureDirSync(vscodeDir);
        const settingsPath = path.join(vscodeDir, "settings.json");
        let existingSettings: Record<string, unknown> = {};
        if (fs.existsSync(settingsPath)) {
            // settings.json may contain JS-style comments (JSONC), strip them before parsing
            const raw = fs.readFileSync(settingsPath, "utf-8");
            const stripped = raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
            try {
                existingSettings = JSON.parse(stripped);
            } catch {
                // If still invalid, start fresh — our injected settings are more important
                existingSettings = {};
            }
        }
        const mergedSettings = {
            ...existingSettings,
            "telemetry.telemetryLevel": "off",
            "redhat.telemetry.enabled": false,
            "workbench.colorTheme": "Default Dark Modern",
            "update.mode": "none",
            "extensions.ignoreRecommendations": true,
        };
        fs.writeFileSync(settingsPath, JSON.stringify(mergedSettings, null, 4));

        // 2. Resolve VS Code executable.
        const vscodePath = await downloadAndUnzipVSCode(vscodeVersion);
        const [, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodePath);

        // 3. Launch VS Code as an Electron app.
        const electronApp = await _electron.launch({
            executablePath: vscodePath,
            env: { ...process.env, NODE_ENV: "development" },
            args: [
                "--no-sandbox",
                "--disable-gpu-sandbox",
                "--disable-updates",
                "--skip-welcome",
                "--skip-release-notes",
                "--disable-workspace-trust",
                "--password-store=basic",
                // Suppress notifications that block UI interactions
                "--disable-telemetry",
                ...cliArgs,
                `--extensionDevelopmentPath=${EXTENSION_ROOT}`,
                projectDir,
            ],
        });

        const page = await electronApp.firstWindow();

        // Auto-dismiss Electron native dialogs (e.g. redhat.java refactoring
        // confirmation "wants to make refactoring changes"). These dialogs are
        // outside the renderer DOM and cannot be handled via Playwright Page API.
        // Monkey-patch dialog.showMessageBox in the main process to find and
        // click the "OK" button by label, falling back to the first button.
        await electronApp.evaluate(({ dialog }) => {
            const origShowMessageBox = dialog.showMessageBox;
            dialog.showMessageBox = async (_win: any, opts: any) => {
                // opts may be the first arg if called without a window
                const options = opts || _win;
                const buttons: string[] = options?.buttons || [];
                // Find "OK" button index; fall back to first button
                let idx = buttons.findIndex((b: string) => /^OK$/i.test(b));
                if (idx < 0) idx = 0;
                return { response: idx, checkboxChecked: true };
            };
            dialog.showMessageBoxSync = (_win: any, opts: any) => {
                const options = opts || _win;
                const buttons: string[] = options?.buttons || [];
                let idx = buttons.findIndex((b: string) => /^OK$/i.test(b));
                if (idx < 0) idx = 0;
                return idx;
            };
        });

        // Dismiss any startup notifications/dialogs before handing off to tests
        await page.waitForTimeout(3_000);
        await dismissAllNotifications(page);

        // 4. Optional tracing
        if (testInfo.retry > 0 || !process.env.CI) {
            await page.context().tracing.start({ screenshots: true, snapshots: true, title: testInfo.title });
        }

        // ---- hand off to the test ----
        await use(page);

        // ---- teardown ----
        // Save trace on failure/retry
        if (testInfo.status !== "passed" || testInfo.retry > 0) {
            const tracePath = testInfo.outputPath("trace.zip");
            try {
                await page.context().tracing.stop({ path: tracePath });
                testInfo.attachments.push({ name: "trace", path: tracePath, contentType: "application/zip" });
            } catch {
                // Tracing may not have been started
            }
        }

        await electronApp.close();

        // Clean up temp directory
        try {
            fs.rmSync(tmpDir, { force: true, recursive: true });
        } catch (e) {
            console.warn(`Warning: failed to clean up ${tmpDir}: ${e}`);
        }
    },
});

/**
 * Dismiss all VS Code notification toasts (telemetry prompts, theme suggestions, etc.).
 * These notifications can steal focus and block Quick Open / Command Palette interactions.
 */
async function dismissAllNotifications(page: Page): Promise<void> {
    try {
        // Click "Clear All Notifications" if the notification center button is visible
        const clearAll = page.locator(".notifications-toasts .codicon-notifications-clear-all, .notification-toast .codicon-close");
        let count = await clearAll.count().catch(() => 0);
        while (count > 0) {
            await clearAll.first().click();
            await page.waitForTimeout(500);
            count = await clearAll.count().catch(() => 0);
        }

        // Also try the command palette approach as a fallback
        const notificationToasts = page.locator(".notification-toast");
        if (await notificationToasts.count().catch(() => 0) > 0) {
            // Use keyboard shortcut to clear all notifications
            await page.keyboard.press("Control+Shift+P");
            const input = page.locator(".quick-input-widget input.input");
            if (await input.isVisible({ timeout: 3_000 }).catch(() => false)) {
                await input.fill("Notifications: Clear All Notifications");
                await page.waitForTimeout(500);
                await input.press("Enter");
                await page.waitForTimeout(500);
            }
        }
    } catch {
        // Best effort
    }
}
