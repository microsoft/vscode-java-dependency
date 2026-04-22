// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from "@vscode/test-electron";
import * as childProcess from "child_process";

/**
 * Global setup runs once before all test files.
 * It downloads VS Code and installs the redhat.java extension so that
 * every test run starts from an identical, pre-provisioned state.
 *
 * Our own extension is loaded at launch time via --extensionDevelopmentPath
 * (see baseTest.ts), so there is no need to install a VSIX here.
 */
export default async function globalSetup(): Promise<void> {
    // Download VS Code stable (or the version configured via VSCODE_VERSION env).
    const vscodeVersion = process.env.VSCODE_VERSION || "stable";
    console.log(`[globalSetup] Downloading VS Code ${vscodeVersion}…`);
    const vscodePath = await downloadAndUnzipVSCode(vscodeVersion);
    const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodePath);

    // On Windows, the CLI is a .cmd batch file which requires shell: true.
    const isWindows = process.platform === "win32";
    const execOptions: childProcess.ExecFileSyncOptions = {
        encoding: "utf-8",
        stdio: "inherit",
        timeout: 120_000,
        shell: isWindows,
    };

    // Install the Language Support for Java extension from the Marketplace.
    console.log("[globalSetup] Installing redhat.java extension…");
    childProcess.execFileSync(cli, [...cliArgs, "--install-extension", "redhat.java"], execOptions);
}
