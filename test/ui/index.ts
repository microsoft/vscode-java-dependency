// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as os from "os";
import * as path from "path";
import { ExTester } from "vscode-extension-tester";

async function main(): Promise<void> {
    try {
        // Run UI command tests
        const testPath = path.join(__dirname, "command.test.js");
        const exTester = new ExTester();
        // The current version (4.1.1) of vscode-extension-tester doesn't support the newest VSCode version (^1.58.0)
        await exTester.downloadCode("1.57.0");
        await exTester.installVsix();
        await exTester.installFromMarketplace("redhat.java");
        await exTester.downloadChromeDriver("1.57.0");
        await exTester.setupRequirements({vscodeVersion: "1.57.0"});
        process.exit(await exTester.runTests(testPath, {vscodeVersion: "1.57.0"}));
    } catch (err) {
        process.stdout.write(`${err}${os.EOL}`);
        process.exit(1);
    }
}

main();
