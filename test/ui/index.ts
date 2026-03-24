// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import { ExTester } from "vscode-extension-tester";

/* tslint:disable:no-console */
async function main(): Promise<void> {
    try {
        // Run UI command tests
        const testPath = path.join(__dirname, "command.test.js");
        const exTester = new ExTester("./test-resources");
        await exTester.downloadCode();
        await exTester.installVsix();
        await exTester.installFromMarketplace("redhat.java");
        await exTester.downloadChromeDriver();
        await exTester.setupRequirements();
        process.exit(await exTester.runTests(testPath, {resources: []}));
    } catch (err) {
        console.log(err);
        process.exit(1);
    }
}

main();
