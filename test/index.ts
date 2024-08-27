// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath, runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
    try {
        // test fails in macOS since the limitation of path length
        // See: https://github.com/microsoft/vscode/issues/86382#issuecomment-593765388
        const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "vscode-user"));
        const vscodeExecutablePath = await downloadAndUnzipVSCode();

        // Resolve redhat.java dependency
        const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
        const options: cp.SpawnSyncOptionsWithStringEncoding = {
            encoding: 'utf-8',
            stdio: 'inherit',
        };
        if (process.platform === 'win32') {
            options.shell = true;
        }
        cp.spawnSync(cli, [...args, '--install-extension', 'redhat.java'], options);

        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath: string = path.resolve(__dirname, "../../");

        // Download VS Code, unzip it and run the integration test

        // Run general test
        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath,
            extensionTestsPath: path.resolve(__dirname, "./suite"),
            launchArgs: [
                path.join(__dirname, "..", "..", "test", "java9"),
                `--user-data-dir=${userDir}`,
            ],
        });

        // Run test for simple project
        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath,
            extensionTestsPath: path.resolve(__dirname, "./simple-suite"),
            launchArgs: [
                path.join(__dirname, "..", "..", "test", "simple"),
                `--user-data-dir=${userDir}`,
            ],
        });

        // Run test for maven project
        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath,
            extensionTestsPath: path.resolve(__dirname, "./maven-suite"),
            launchArgs: [
                path.join(__dirname, "..", "..", "test", "maven"),
                `--user-data-dir=${userDir}`,
            ],
        });

        // Run test for gradle project
        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath,
            extensionTestsPath: path.resolve(__dirname, "./gradle-suite"),
            launchArgs: [
                path.join(__dirname, "..", "..", "test", "gradle"),
                `--user-data-dir=${userDir}`,
            ],
        });

        // Run test for invisible project
        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath,
            extensionTestsPath: path.resolve(__dirname, "./invisible-suite"),
            launchArgs: [
                path.join(__dirname, "..", "..", "test", "invisible"),
                `--user-data-dir=${userDir}`,
            ],
        });


        // Run multi module test
        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath,
            extensionTestsPath: path.resolve(__dirname, "./multi-module-suite"),
            launchArgs: [
                path.join(__dirname, "..", "..", "test", "multi-module"),
                `--user-data-dir=${userDir}`,
            ],
        });

        process.exit(0);

    } catch (err) {
        process.stdout.write(`${err}${os.EOL}`);
        process.exit(1);
    }
}

main();
