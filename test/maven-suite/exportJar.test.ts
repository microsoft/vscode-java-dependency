// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as cp from "child_process";
import * as fse from "fs-extra";
import { suiteTeardown } from "mocha";
import * as path from "path";
import { Task, TaskEndEvent, tasks, workspace } from "vscode";
import { setupTestEnv } from "../shared";

// tslint:disable: only-arrow-functions
const folderPath: string = workspace.workspaceFolders![0].uri.fsPath;
const jarFileName: string = "maven.jar";
const testFolder: string = path.join(folderPath, "test");

suite("Export Jar Tests", () => {

    suiteSetup(setupTestEnv);

    test("Can export jar correctly", async function() {
        const vscodeTasks: Task[] = await tasks.fetchTasks();
        const exportJarTask: Task | undefined = vscodeTasks.find((t: Task) => t.name === "java (buildArtifact): maven");
        assert.ok(exportJarTask !== undefined);

        await new Promise<void>(async (resolve) => {
            tasks.onDidEndTask((e: TaskEndEvent) => {
                if (e.execution.task.name === exportJarTask?.name) {
                    return resolve();
                }
            });
            await tasks.executeTask(exportJarTask!);
        });

        const isFileExist: boolean = await fse.pathExists(path.join(folderPath, jarFileName));
        assert.ok(isFileExist);

        await fse.ensureDir(testFolder);
        cp.execSync("jar -xvf ../maven.jar", {
            cwd: testFolder,
        });

        const isManifestExist: boolean = await fse.pathExists(path.join(testFolder, "META-INF", "MANIFEST.MF"));
        assert.ok(isManifestExist);
        const isClassFileExist: boolean = await fse.pathExists(path.join(testFolder, "com", "mycompany", "app", "App.class"));
        assert.ok(isClassFileExist);
    });

    suiteTeardown(async function() {
        await fse.remove(path.join(folderPath, jarFileName));
        await fse.remove(testFolder);
    });
});
