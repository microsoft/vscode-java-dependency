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
                ...cliArgs,
                `--extensionDevelopmentPath=${EXTENSION_ROOT}`,
                projectDir,
            ],
        });

        const page = await electronApp.firstWindow();

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
