// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { defineConfig } from "@playwright/test";
import * as path from "path";

export default defineConfig({
    testDir: path.join(__dirname, "tests"),
    reporter: process.env.CI
        ? [["list"], ["junit", { outputFile: path.join(__dirname, "..", "..", "test-results", "e2e-results.xml") }]]
        : "list",
    // Java Language Server can take 2-3 minutes to fully index on first run.
    timeout: 180_000,
    // Run tests sequentially — launching multiple VS Code instances is too resource-heavy.
    workers: 1,
    // Allow one retry in CI to handle transient environment issues.
    retries: process.env.CI ? 1 : 0,
    expect: {
        timeout: 30_000,
    },
    globalSetup: path.join(__dirname, "globalSetup.ts"),
    use: {
        trace: "on-first-retry",
    },
    outputDir: path.join(__dirname, "..", "..", "test-results", "e2e"),
});
