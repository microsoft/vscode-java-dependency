// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(__dirname, "../..");
runTests({
    vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH,
    extensionDevelopmentPath: root,
    extensionTestsPath: path.join(__dirname, "lsp-tools-suite"),
    launchArgs: [
        "--disable-extensions",
        "--skip-welcome",
        "--skip-release-notes",
        `--user-data-dir=${path.join(root, ".vscode-test", "lsp-tools-user")}`,
        `--extensions-dir=${path.join(root, ".vscode-test", "lsp-tools-extensions")}`,
    ],
}).catch(error => {
    process.stderr.write(`${error}\n`);
    process.exitCode = 1;
});
