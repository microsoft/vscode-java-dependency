// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from "fs-extra";
import * as path from "path";
import * as semver from "semver";
import { ExTester } from "vscode-extension-tester";

/* tslint:disable:no-console */
async function main(): Promise<void> {
    try {
        // Run UI command tests
        const packageContent = await fse.readFile(path.join(__dirname, "..", "..", "..", "package.json"));
        const packageJSON = JSON.parse(packageContent.toString());
        let vscodeVersion = packageJSON.engines.vscode;
        if (!vscodeVersion) {
            console.log("No valid version of VSCode engine was found in package.json");
            process.exit(1);
        }
        vscodeVersion = semver.minVersion(vscodeVersion);
        const version = vscodeVersion.version;
        const testPath = path.join(__dirname, "command.test.js");
        const exTester = new ExTester();
        await exTester.downloadCode(version);
        await exTester.installVsix();
        await exTester.installFromMarketplace("redhat.java");
        await exTester.downloadChromeDriver(version);
        await exTester.setupRequirements({vscodeVersion: version});
        process.exit(await exTester.runTests(testPath, {vscodeVersion: version}));
    } catch (err) {
        console.log(err);
        process.exit(1);
    }
}

main();
