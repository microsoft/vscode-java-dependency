// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import { commands, extensions } from "vscode";
import { Commands, ContainerNode, contextManager, DependencyExplorer,
    PackageNode, PackageRootNode, PrimaryTypeNode, ProjectNode } from "../../extension.bundle";
import { fsPath, Uris } from "../shared";

suite("Maven Project View Tests", () => {
    test("Can node render correctly", async function() {
        this.timeout(1 * 60 * 1000);
        await extensions.getExtension("vscjava.vscode-java-dependency")!.activate();

        // context would be initialized after this command
        await commands.executeCommand(Commands.JAVA_PROJECT_ACTIVATE);
        const explorer = DependencyExplorer.getInstance(contextManager.context);

        // validate root nodes
        const roots = await explorer.dataProvider.getChildren();
        assert.equal(roots.length, 1, "Number of root node should be 1");
        const projectNode = roots[0] as ProjectNode;
        assert.equal(projectNode.name, "my-app", "Project name should be \"my-app\"");

        // validate package root/dependency nodes
        const packageRoots = await projectNode.getChildren();
        assert.equal(packageRoots.length, 4, "Number of root packages should be 4");
        const mainPackage = packageRoots[0] as PackageRootNode;
        const testPackage = packageRoots[1] as PackageRootNode;
        assert.equal(mainPackage.name, "src/main/java", "Package name should be \"src/main/java\"");
        assert.equal(testPackage.name, "src/test/java", "Package name should be \"src/test/java\"");
        const systemLibrary = packageRoots[2] as ContainerNode;
        const mavenDependency = packageRoots[3] as ContainerNode;
        // only match prefix of system library since JDK version may differ
        assert.ok(systemLibrary.name.startsWith("JRE System Library"), "Container name should start with JRE System Library");
        assert.equal(mavenDependency.name, "Maven Dependencies", "Container name should be \"Maven Dependencies\"");

        // validate package nodes
        const mainSubPackages = await mainPackage.getChildren();
        const testSubPackages = await testPackage.getChildren();
        assert.equal(mainSubPackages.length, 1, "Number of main sub packages should be 1");
        assert.equal(testSubPackages.length, 1, "Number of test sub packages should be 1");
        const mainSubPackage = mainSubPackages[0] as PackageNode;
        const testSubPackage = testSubPackages[0] as PackageNode;
        assert.equal(mainSubPackage.name, "com.mycompany.app", "Name of subpackage should be \"com.mycompany.app\"");
        assert.equal(testSubPackage.name, "com.mycompany.app", "Name of subpackage should be \"com.mycompany.app\"");

        // validate innermost layer nodes
        const mainClasses = await mainSubPackage.getChildren();
        const testClasses = await testSubPackage.getChildren();
        assert.equal(mainClasses.length, 1, "Number of main classes should be 1");
        assert.equal(testClasses.length, 1, "Number of test classes should be 1");
        const mainClass = mainClasses[0] as PrimaryTypeNode;
        const testClass = testClasses[0] as PrimaryTypeNode;
        assert.equal(mainClass.name, "App", "Name of main class should be \"App\"");
        assert.equal(testClass.name, "AppTest", "Name of test class should be \"AppTest\"");
    });

    test("Can node have correct uri", async function() {
        this.timeout(1 * 60 * 1000);
        await extensions.getExtension("vscjava.vscode-java-dependency")!.activate();

        // context would be initialized after this command
        await commands.executeCommand(Commands.JAVA_PROJECT_ACTIVATE);
        const explorer = DependencyExplorer.getInstance(contextManager.context);

        const projectNode = (await explorer.dataProvider.getChildren())[0] as ProjectNode;
        const packageRoots = await projectNode.getChildren();
        const mainPackage = packageRoots[0] as PackageRootNode;
        const testPackage = packageRoots[1] as PackageRootNode;
        const mainSubPackage = (await mainPackage.getChildren())[0] as PackageNode;
        const testSubPackage = (await testPackage.getChildren())[0] as PackageNode;
        const mainClass = (await mainSubPackage.getChildren())[0] as PrimaryTypeNode;
        const testClass = (await testSubPackage.getChildren())[0] as PrimaryTypeNode;

        assert.equal(fsPath(projectNode), Uris.MAVEN_PROJECT_NODE, "Project uri incorrect");
        assert.equal(fsPath(mainPackage), Uris.MAVEN_MAIN_PACKAGE, "Main root package uri incorrect");
        assert.equal(fsPath(testPackage), Uris.MAVEN_TEST_PACKAGE, "Test root package uri incorrect");
        assert.equal(fsPath(mainSubPackage), Uris.MAVEN_MAIN_SUBPACKAGE, "Main subpackage uri incorrect");
        assert.equal(fsPath(testSubPackage), Uris.MAVEN_TEST_SUBPACKAGE, "Test subpackage uri incorrect");
        assert.equal(fsPath(mainClass), Uris.MAVEN_MAIN_CLASS, "Main class uri incorrect");
        assert.equal(fsPath(testClass), Uris.MAVEN_TEST_CLASS, "Test class uri incorrect");
    });
});
