// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as clipboardy from "clipboardy";
import * as path from "path";
import * as vscode from "vscode";
import { Commands, ContainerNode, contextManager, DataNode, DependencyExplorer, FileNode,
    INodeData, Jdtls, NodeKind, PackageNode, PackageRootNode, PrimaryTypeNode, ProjectNode } from "../../extension.bundle";
import { fsPath, setupTestEnv, Uris } from "../shared";
import { sleep } from "../util";

// tslint:disable: only-arrow-functions
suite("Maven Project View Tests", () => {

    suiteSetup(setupTestEnv);

    test("Can node render correctly in hierarchical view", async function() {
        await vscode.workspace.getConfiguration("java.dependency").update("packagePresentation", "hierarchical");
        await vscode.commands.executeCommand(Commands.VIEW_PACKAGE_CHANGETOHIERARCHICALPACKAGEVIEW);
        await vscode.commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH);
        const explorer = DependencyExplorer.getInstance(contextManager.context);

        const roots = await explorer.dataProvider.getChildren();
        assert.equal(roots?.length, 1, "Number of root node should be 1");
        const projectNode = roots![0] as ProjectNode;
        assert.equal(projectNode.name, "my-app", "Project name should be \"my-app\"");

        const projectChildren = await projectNode.getChildren();
        assert.ok(!!projectChildren.find((c: DataNode) => c.name === "pom.xml"));
        assert.ok(!!projectChildren.find((c: DataNode) => c.name === ".vscode"));
        assert.equal(projectChildren.length, 8, "Number of children should be 8");
        const mainPackage = projectChildren[0] as PackageRootNode;
        assert.equal(mainPackage.name, "src/main/java", "Package name should be \"src/main/java\"");

        const mainSourceSetChildren = await mainPackage.getChildren();
        assert.equal(mainSourceSetChildren.length, 2, "Number of primary subpackages should be 2");
        const primarySubPackage = mainSourceSetChildren[0] as DataNode;
        assert.equal(primarySubPackage.name, "com.mycompany", "Name of primary subpackage should be \"com.mycompany\"");

        const moduleInfo = mainSourceSetChildren[1] as DataNode;
        assert.equal(moduleInfo.name, "module-info.java");

        const secondarySubPackages = await primarySubPackage.getChildren();
        assert.equal(secondarySubPackages.length, 2, "Number of secondary subpackages should be 1");
        const firstSecondarySubPackage = secondarySubPackages[0] as PackageNode;
        const secondSecondarySubPackage = secondarySubPackages[1] as PackageNode;
        assert.equal(firstSecondarySubPackage.nodeData.displayName, "app", "Name of first secondary subpackage should be \"app\"");
        assert.equal(secondSecondarySubPackage.nodeData.displayName, "app1", "Name of first secondary subpackage should be \"app1\"");

        // validate innermost layer nodes
        const classes = await firstSecondarySubPackage.getChildren();
        assert.equal(classes.length, 3, "Number of main classes of first package should be 3");
        const firstClass = classes[0] as PrimaryTypeNode;
        const secondClass = classes[1] as PrimaryTypeNode;
        const thirdClass = classes[2] as PrimaryTypeNode;
        assert.equal(firstClass.name, "App", "Name of first class should be \"App\"");
        assert.equal(secondClass.name, "AppToDelete", "Name of second class should be \"AppToDelete\"");
        assert.equal(thirdClass.name, "AppToRename", "Name of third class should be \"AppToRename\"");
    });

    test("Can node render correctly in flat view", async function() {
        await vscode.workspace.getConfiguration("java.dependency").update("packagePresentation", "flat");
        await vscode.commands.executeCommand(Commands.VIEW_PACKAGE_CHANGETOFLATPACKAGEVIEW);
        await vscode.commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH);
        const explorer = DependencyExplorer.getInstance(contextManager.context);

        // validate root nodes
        const roots = await explorer.dataProvider.getChildren();
        assert.equal(roots?.length, 1, "Number of root node should be 1");
        const projectNode = roots![0] as ProjectNode;
        assert.equal(projectNode.name, "my-app", "Project name should be \"my-app\"");
        const projectTreeItem: vscode.TreeItem = await projectNode.getTreeItem();
        assert.ok(projectTreeItem.resourceUri !== undefined, "Project tree item should have resourceUri");

        // validate package root/dependency nodes
        const projectChildren = await projectNode.getChildren();
        assert.ok(!!projectChildren.find((c: DataNode) => c.name === "pom.xml"));
        assert.ok(!!projectChildren.find((c: DataNode) => c.name === ".vscode"));
        const mainPackage = projectChildren[0] as PackageRootNode;
        const testPackage = projectChildren[1] as PackageRootNode;
        assert.equal(mainPackage.name, "src/main/java", "Package name should be \"src/main/java\"");
        assert.equal(testPackage.name, "src/test/java", "Package name should be \"src/test/java\"");
        const systemLibrary = projectChildren[2] as ContainerNode;
        const mavenDependency = projectChildren[3] as ContainerNode;
        // only match prefix of system library since JDK version may differ
        assert.ok(systemLibrary.name.startsWith("JRE System Library"), "Container name should start with JRE System Library");
        assert.equal(mavenDependency.name, "Maven Dependencies", "Container name should be \"Maven Dependencies\"");

        // validate package nodes
        const mainSourceSetChildren = await mainPackage.getChildren();
        assert.equal(mainSourceSetChildren.length, 3, "Number of main source set children should be 3");

        const firstMainSubPackage = mainSourceSetChildren[0] as DataNode;
        assert.equal(firstMainSubPackage.name, "com.mycompany.app", "Name of first main subpackage should be \"com.mycompany.app\"");

        const secondMainSubPackage = mainSourceSetChildren[1] as DataNode;
        assert.equal(secondMainSubPackage.name, "com.mycompany.app1", "Name of second main subpackage should be \"com.mycompany.app1\"");

        const moduleInfo = mainSourceSetChildren[2] as DataNode;
        assert.equal(moduleInfo.name, "module-info.java");

        const testSourceSetChildren = await testPackage.getChildren();
        assert.equal(testSourceSetChildren.length, 1, "Number of test sub packages should be 1");
        const testSubPackage = testSourceSetChildren[0] as PackageNode;
        
        
        assert.equal(testSubPackage.name, "com.mycompany.app", "Name of test subpackage should be \"com.mycompany.app\"");

        // validate innermost layer nodes
        const mainClasses = await firstMainSubPackage.getChildren();
        const testClasses = await testSubPackage.getChildren();
        assert.equal(mainClasses.length, 3, "Number of main classes of first package should be 3");
        assert.equal(testClasses.length, 1, "Number of test classes should be 1");
        const firstMainClass = mainClasses[0] as PrimaryTypeNode;
        const secondMainClass = mainClasses[1] as PrimaryTypeNode;
        const thirdMainClass = mainClasses[2] as PrimaryTypeNode;
        const testClass = testClasses[0] as PrimaryTypeNode;
        assert.equal(firstMainClass.name, "App", "Name of first class should be \"App\"");
        assert.equal(secondMainClass.name, "AppToDelete", "Name of second class should be \"AppToDelete\"");
        assert.equal(thirdMainClass.name, "AppToRename", "Name of third class should be \"AppToRename\"");
        assert.equal(testClass.name, "AppTest", "Name of test class should be \"AppTest\"");
    });

    test("Can node have correct uri", async function() {
        const explorer = DependencyExplorer.getInstance(contextManager.context);

        const projectNode = (await explorer.dataProvider.getChildren())![0] as ProjectNode;
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

    test("Can execute command java.view.package.copyFilePath correctly", async function() {
        const explorer = DependencyExplorer.getInstance(contextManager.context);

        const projectNode = (await explorer.dataProvider.getChildren())![0] as ProjectNode;
        const packageRoots = await projectNode.getChildren();
        const mainPackage = packageRoots[0] as PackageRootNode;
        const mainSubPackage = (await mainPackage.getChildren())[0] as PackageNode;
        const mainClass = (await mainSubPackage.getChildren())[0] as PrimaryTypeNode;

        await vscode.commands.executeCommand(Commands.VIEW_PACKAGE_COPY_FILE_PATH, mainClass);
        await sleep(1000);
        const content = await clipboardy.read();
        const contentUri = vscode.Uri.file(content);
        const dataUri = mainClass.nodeData.uri;
        assert.ok(dataUri, `Class node should have correct uri`);
        const expectedUri = vscode.Uri.parse(dataUri!);
        assert.equal(contentUri.fsPath, expectedUri.fsPath, `File path should be copied correctly`);
    });

    test("Can execute command java.view.package.copyRelativeFilePath correctly", async function() {
        const explorer = DependencyExplorer.getInstance(contextManager.context);

        const projectNode = (await explorer.dataProvider.getChildren())![0] as ProjectNode;
        const packageRoots = await projectNode.getChildren();
        const mainPackage = packageRoots[0] as PackageRootNode;
        const mainSubPackage = (await mainPackage.getChildren())[0] as PackageNode;
        const mainClass = (await mainSubPackage.getChildren())[0] as PrimaryTypeNode;

        await vscode.commands.executeCommand(Commands.VIEW_PACKAGE_COPY_RELATIVE_FILE_PATH, mainClass);
        await sleep(1000);
        const content = await clipboardy.read();
        const dataUri = mainClass.nodeData.uri;
        assert.ok(dataUri, `Class node should have correct uri`);
        const expectedUri = vscode.Uri.parse(dataUri!);
        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders, `There should be valid workspace folders`);
        const relativePath = path.relative(workspaceFolders![0].uri.fsPath, expectedUri.fsPath);
        assert.equal(content, relativePath, `Relative file path should be copied correctly`);
    });

    test("Can execute command java.project.list correctly", async function() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders, `There should be valid workspace folders`);
        const projects = await Jdtls.getProjects(workspaceFolders![0].uri.toString());
        assert.equal(projects?.length, 1, "project's length should be 1");
        assert.equal(projects![0].name, "my-app", "project should be my-app");
    });

    test("Can execute command java.getPackageData correctly", async function() {
        const explorer = DependencyExplorer.getInstance(contextManager.context);

        const projectNode = (await explorer.dataProvider.getChildren())![0] as ProjectNode;
        const packageRoots = await projectNode.getChildren();
        const mainPackage = packageRoots[0] as PackageRootNode;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders, `There should be valid workspace folders`);
        const packages = await vscode.commands.executeCommand<INodeData[]>(Commands.EXECUTE_WORKSPACE_COMMAND,
            Commands.JAVA_GETPACKAGEDATA, {
            kind: NodeKind.PackageRoot,
            projectUri: workspaceFolders![0].uri.toString(),
            path: mainPackage.nodeData.name,
            handlerIdentifier: mainPackage.nodeData.handlerIdentifier,
        });
        assert.equal(packages?.length, 3, "packages' length should be 3");
        assert.equal(packages![0].name, "com.mycompany.app");
        assert.equal(packages![1].name, "com.mycompany.app1");
        assert.equal(packages![2].name, "module-info.java");
    });

    test("Can execute command java.resolvePath correctly", async function() {
        const explorer = DependencyExplorer.getInstance(contextManager.context);

        const projectNode = (await explorer.dataProvider.getChildren())![0] as ProjectNode;
        const projectChildren = await projectNode.getChildren();
        const fileNode = projectChildren.find((node: DataNode) => node.nodeData.name === "pom.xml") as FileNode;
        const paths = await vscode.commands.executeCommand<INodeData[]>(Commands.EXECUTE_WORKSPACE_COMMAND,
            Commands.JAVA_RESOLVEPATH, fileNode.nodeData.uri);
        assert.equal(paths?.length, 2, "paths' length should be 2");
        assert.equal(paths![0].name, projectNode.name);
        assert.equal(paths![1].name, fileNode.name);
    });

    test("Can execute command java.project.getMainClasses correctly", async function() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders, `There should be valid workspace folders`);
        const mainClasses = await Jdtls.getMainClasses(workspaceFolders![0].uri.toString());
        assert.equal(mainClasses?.length, 1, "mainClasses' length should be 1");
        assert.equal(mainClasses![0].name, "com.mycompany.app.App", "mainClasses[0]'s name should be com.mycompany.app.App");
    });

    test("Can apply 'files.exclude'", async function() {
        const explorer = DependencyExplorer.getInstance(contextManager.context);

        const projectNode = (await explorer.dataProvider.getChildren())![0] as ProjectNode;
        const projectChildren = await projectNode.getChildren();
        assert.ok(!projectChildren.find((node: DataNode) => node.nodeData.name === ".hidden"));
    });
});
