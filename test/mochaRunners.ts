// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const suites = [
    "suite", "simple-suite", "maven-suite", "gradle-suite", "invisible-suite",
    "multi-module-suite", "multiple-suite", "non-java-gradle-suite", "lsp-tools-suite",
];

// Keep fixtures below the compiled tests so Node resolves the project's dependencies.
const fixture = fs.mkdtempSync(path.join(__dirname, "mocha-runner-"));
try {
    for (const suiteName of suites) {
        fs.copyFileSync(path.join(__dirname, suiteName, "index.js"), path.join(fixture, "index.js"));
        for (const failing of [false, true]) {
            fs.writeFileSync(path.join(fixture, "javaContextTools.test.js"),
                `suite("Mocha interop", () => test("fixture", () => {${
                    failing ? 'throw new Error("expected fixture failure");' : ""
                }}));`);
            const result = cp.spawnSync(process.execPath, ["-e", `
                require(${JSON.stringify(path.join(fixture, "index.js"))}).run().catch(error => {
                    console.error(error);
                    process.exitCode = 1;
                });
            `], { encoding: "utf8", timeout: 30000 });
            if (result.error) {
                throw result.error;
            }
            const output = result.stdout + result.stderr;
            assert.strictEqual(result.status, failing ? 1 : 0, `${suiteName}: ${output}`);
            assert.match(output, failing ? /1 tests failed/ : /1 passing/, `${suiteName}: ${output}`);
        }
    }
    process.stdout.write(`Mocha runner interop: ${suites.length} suites passed success/failure checks.${os.EOL}`);
} finally {
    fs.rmSync(fixture, { recursive: true, force: true });
}
