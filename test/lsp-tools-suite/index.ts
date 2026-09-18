// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as Mocha from "mocha";
import * as path from "path";

export function run(): Promise<void> {
    const mocha = new Mocha({ ui: "tdd", color: true, timeout: 10000 });
    mocha.addFile(path.join(__dirname, "javaContextTools.test.js"));
    return new Promise((resolve, reject) => {
        mocha.run(failures => failures ? reject(new Error(`${failures} tests failed.`)) : resolve());
    });
}
