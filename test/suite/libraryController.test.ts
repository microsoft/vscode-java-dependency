// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import { dedupAlreadyCoveredPattern } from "../../extension.bundle";

// tslint:disable: only-arrow-functions

suite("Library Controller Tests", () => {

    test("test deduplicating covered library patterns", () => {
        assert.deepStrictEqual(
            dedupAlreadyCoveredPattern(["lib/**/*.jar"], "lib/foo.jar", "other/foo.jar"),
            ["other/foo.jar"],
        );
    });
});
