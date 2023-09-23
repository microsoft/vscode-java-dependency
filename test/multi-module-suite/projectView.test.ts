// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import { contextManager, DependencyExplorer,
    FileNode,
    ProjectNode } from "../../extension.bundle";
import { printNodes, setupTestEnv } from "../shared";

// tslint:disable: only-arrow-functions
suite("Multi Module Tests", () => {

    suiteSetup(setupTestEnv);

    test("Can open module with name equal or longer than folder name correctly", async function() {
        const explorer = DependencyExplorer.getInstance(contextManager.context);

        const roots = await explorer.dataProvider.getChildren();
        const nestedProjectNode = roots?.find(project =>
            project instanceof ProjectNode && project.name === 'de.myorg.myservice.level1') as ProjectNode;

        const projectChildren = await nestedProjectNode.getChildren();
        assert.ok(!!projectChildren.find(child => child instanceof FileNode && child.path?.endsWith('level1/pom.xml'), `Expected to find FileNode with level1 pom.xml in:\n${printNodes(projectChildren)}`));
    });
});
