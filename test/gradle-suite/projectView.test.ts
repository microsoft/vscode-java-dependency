// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import { ContainerNode, contextManager, DataNode, DependencyExplorer,
    languageServerApiManager,
    PackageRootNode, PrimaryTypeNode, ProjectNode } from "../../extension.bundle";
import { fsPath, setupTestEnv, Uris } from "../shared";

// tslint:disable: only-arrow-functions
suite("Gradle Project View Tests", () => {

    suiteSetup(async () => {
        await setupTestEnv();
        await languageServerApiManager.ready();
    });

    test("Can node render correctly", async function() {
        this.timeout(120000);
        const explorer = DependencyExplorer.getInstance(contextManager.context);

        // validate root nodes
        const roots = await explorer.dataProvider.getChildren();
        assert.equal(roots?.length, 1, "Number of root node should be 1");
        const projectNode = roots![0] as ProjectNode;
        assert.equal(projectNode.name, "gradle", "Project name should be \"gradle\"");

        // validate package root/dependency nodes
        const projectChildren = await projectNode.getChildren();
        assert.ok(!!projectChildren.find((c: DataNode) => c.name === "build.gradle"));
        assert.ok(!!projectChildren.find((c: DataNode) => c.name === ".vscode"));
        const mainPackage = projectChildren.find((c: DataNode) => c.name === "src/main/java") as PackageRootNode;
        assert.ok(mainPackage, "Should have src/main/java package root");
        const systemLibrary = projectChildren.find((c: DataNode) => c.name.startsWith("JRE System Library")) as ContainerNode;
        const gradleDependency = projectChildren.find((c: DataNode) => c.name === "Project and External Dependencies") as ContainerNode;
        // only match prefix of system library since JDK version may differ
        assert.ok(systemLibrary, "Should have JRE System Library container");
        assert.ok(gradleDependency, "Should have Project and External Dependencies container");

        // validate innermost layer nodes
        const mainClasses = await mainPackage.getChildren();
        assert.equal(mainClasses.length, 1, "Number of main classes should be 1");
        const mainClass = mainClasses[0] as PrimaryTypeNode;
        assert.equal(mainClass.name, "GradleTest", "Name of main class should be \"GradleTest\"");
    });

    test("Can node have correct uri", async function() {
        const explorer = DependencyExplorer.getInstance(contextManager.context);

        const projectNode = (await explorer.dataProvider.getChildren())![0] as ProjectNode;
        const projectChildren = await projectNode.getChildren();
        const mainPackage = projectChildren.find((c: DataNode) => c.name === "src/main/java") as PackageRootNode;
        assert.ok(mainPackage, "Should have src/main/java");
        const mainClass = (await mainPackage.getChildren())[0] as PrimaryTypeNode;

        assert.equal(fsPath(projectNode), Uris.GRADLE_PROJECT_NODE, "Project uri incorrect");
        assert.equal(fsPath(mainPackage), Uris.GRADLE_MAIN_PACKAGE, "Main root package uri incorrect");
        assert.equal(fsPath(mainClass), Uris.GRADLE_MAIN_CLASS, "Main class uri incorrect");
    });
});
