// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from "@vscode/test-electron";
import * as childProcess from "child_process";
import * as path from "path";

/**
 * Global setup runs once before all test files.
 * It downloads VS Code, then installs the redhat.java extension and our own
 * VSIX so that every test run starts from an identical, pre-provisioned state.
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

    // Install our own VSIX if one exists (built by `vsce package`).
    const vsixGlob = path.join(__dirname, "..", "..", "*.vsix");
    const glob = require("glob");
    const vsixFiles: string[] = glob.sync(vsixGlob);
    if (vsixFiles.length > 0) {
        const vsix = vsixFiles[0];
        console.log(`[globalSetup] Installing VSIX ${path.basename(vsix)}…`);
        childProcess.execFileSync(cli, [...cliArgs, "--install-extension", vsix], {
            ...execOptions,
            timeout: 60_000,
        });
    } else {
        console.log("[globalSetup] No VSIX found — extension will be loaded via extensionDevelopmentPath");
    }
}
