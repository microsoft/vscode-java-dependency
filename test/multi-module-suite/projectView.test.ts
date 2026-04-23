// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import { contextManager, DependencyExplorer,
    FileNode,
    languageServerApiManager,
    ProjectNode } from "../../extension.bundle";
import { printNodes, setupTestEnv } from "../shared";

// tslint:disable: only-arrow-functions
suite("Multi Module Tests", () => {

    suiteSetup(async () => {
        await setupTestEnv();
        await languageServerApiManager.ready();
    });

    test("Can open module with name equal or longer than folder name correctly", async function() {
        this.timeout(120000);
        const explorer = DependencyExplorer.getInstance(contextManager.context);

        const roots = await explorer.dataProvider.getChildren();
        // Find the level1 submodule - LS may use .project name or folder name
        const nestedProjectNode = roots?.find(project =>
            project instanceof ProjectNode && (
                project.name === 'de.myorg.myservice.level1' ||
                project.name === 'fvclaus-de.myorg.myservice.level1' ||
                project.name === 'level1'
            )) as ProjectNode;

        assert.ok(nestedProjectNode, `Expected to find level1 project in roots:\n${roots?.map(r => (r as ProjectNode).name).join(', ')}`);
        const projectChildren = await nestedProjectNode.getChildren();
        assert.ok(!!projectChildren.find(child => child instanceof FileNode && child.path?.endsWith('level1/pom.xml'), `Expected to find FileNode with level1 pom.xml in:\n${printNodes(projectChildren)}`));
    });
});
