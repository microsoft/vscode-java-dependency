// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as fse from "fs-extra";
import { platform } from "os";
import * as path from "path";
import * as vscode from "vscode";
import { Commands, contextManager, DependencyExplorer, PackageNode, PackageRootNode, ProjectNode } from "../../extension.bundle";
import { setupTestEnv } from "../shared";
import { sleep } from "../util";

// tslint:disable: only-arrow-functions
suite("Invisible Project View Tests", () => {

    suiteSetup(setupTestEnv);

    test("Can execute command java.project.refreshLibraries correctly", async function() {
        if (platform() === "darwin") {
            this.skip();
        }
        const explorer = DependencyExplorer.getInstance(contextManager.context);

        let projectNode = (await explorer.dataProvider.getChildren())![0] as ProjectNode;
        const projectUri = projectNode.nodeData.uri;
        assert.ok(projectUri, "project node doesn't have correct uri");
        const expectedUri = vscode.Uri.parse(projectUri!);
        await fse.copy(path.join(expectedUri.fsPath, "libSource", "simple.jar"), path.join(expectedUri.fsPath, "lib", "simple.jar"));
        await vscode.commands.executeCommand(Commands.JAVA_PROJECT_REFRESH_LIBRARIES);
        await sleep(5000);
        projectNode = (await explorer.dataProvider.getChildren())![0] as ProjectNode;
        const packageRoots = await projectNode.getChildren();
        assert.equal(packageRoots.length, 3, "length of package nodes should be 3");
        const mainPackage = packageRoots[2] as PackageRootNode;
        const libraryNode = (await mainPackage.getChildren())[0] as PackageNode;
        assert.equal(libraryNode.nodeData.name, "simple.jar", "library name should be simple.jar");
    });

    test("Can execute command java.project.removeLibrary correctly", async function() {
        if (platform() === "darwin") {
            this.skip();
        }
        const explorer = DependencyExplorer.getInstance(contextManager.context);

        let projectNode = (await explorer.dataProvider.getChildren())![0] as ProjectNode;
        let packageRoots = await projectNode.getChildren();
        assert.equal(packageRoots.length, 3, "length of package nodes should be 3");
        let mainPackage = packageRoots[2] as PackageRootNode;
        const libraryNode = (await mainPackage.getChildren())[0] as PackageNode;
        await vscode.commands.executeCommand(Commands.JAVA_PROJECT_REMOVE_LIBRARY, libraryNode);
        await sleep(5000);
        projectNode = (await explorer.dataProvider.getChildren())![0] as ProjectNode;
        packageRoots = await projectNode.getChildren();
        assert.equal(packageRoots.length, 3, "length of package nodes should be 3");
        mainPackage = packageRoots[2] as PackageRootNode;
        assert.equal((await mainPackage.getChildren()).length, 0, "libraries' length should be 0");
    });

});
