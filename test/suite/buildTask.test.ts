// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import { Task, tasks, TaskScope } from "vscode";
import { BuildTaskProvider, categorizePaths, getFinalPaths } from "../../extension.bundle";
import { setupTestEnv } from "../shared";

// tslint:disable: only-arrow-functions
// tslint:disable: no-object-literal-type-assertion
// tslint:disable: no-invalid-template-strings

suite("Build Task Tests", () => {

    suiteSetup(setupTestEnv);

    test("test providing default build task", async function() {
        this.timeout(60 * 1000 * 3);
        const vscodeTasks: Task[] = await tasks.fetchTasks();
        const exportJarTask: Task | undefined = vscodeTasks.find((t: Task) => {
            return t.name === BuildTaskProvider.defaultTaskName
                && t.source === BuildTaskProvider.type;
        });
        assert.ok(exportJarTask !== undefined);
    });

    test("test categorizePaths()", async function() {
        const [includes, excludes, invalid] = categorizePaths([
            BuildTaskProvider.workspace,
            "a/b/c",
            "!foo"
        ], TaskScope.Workspace);
        assert.deepStrictEqual(includes.length, 2);
        assert.deepStrictEqual(excludes.length, 1);
        assert.deepStrictEqual(invalid.length, 0);
    });

    test("test getFinalPaths() 1", async function() {
        const [result, invalid] = getFinalPaths([
            BuildTaskProvider.workspace,
            "a/b/c",
        ], [
            "foo/bar",
        ], [
            "a/b/c",
            "foo/bar",
            "test/path"
        ]);
        assert.deepStrictEqual(result.length, 2);
        assert.deepStrictEqual(invalid.length, 0);
    });

    test("test getFinalPaths() 2", async function() {
        const [result, invalid] = getFinalPaths([
            "a/b/c",
            "non/exist2"
        ], [
            "foo/bar",
            "non/exist"
        ], [
            "a/b/c",
            "foo/bar",
            "test/path"
        ]);
        assert.deepStrictEqual(result.length, 1);
        assert.deepStrictEqual(invalid.length, 1);
        assert.deepStrictEqual(invalid[0], "non/exist2");
    });
});
