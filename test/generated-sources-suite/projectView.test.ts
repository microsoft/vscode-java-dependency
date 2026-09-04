// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as vscode from "vscode";
import {
    Commands,
    contextManager,
    DataNode,
    DependencyExplorer,
    FileNode,
    FolderNode,
    Jdtls,
    languageServerApiManager,
    NodeKind,
    PackageRootNode,
    PrimaryTypeNode,
    ProjectNode,
} from "../../extension.bundle";
import { printNodes, setupTestEnv } from "../shared";
import { sleep } from "../util";

// tslint:disable: only-arrow-functions
suite("Generated Source Tree Tests", () => {
    let originalShowNonJavaResources: boolean | undefined;

    suiteSetup(async () => {
        originalShowNonJavaResources = vscode.workspace.getConfiguration("java.project.explorer")
            .inspect<boolean>("showNonJavaResources")?.workspaceValue;
        await vscode.workspace.getConfiguration("java.project.explorer").update(
            "showNonJavaResources",
            true,
            vscode.ConfigurationTarget.Workspace,
        );
        await setupTestEnv();
        await languageServerApiManager.ready();
        await vscode.commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH);
        await getProjectNode();
    });

    suiteTeardown(async () => {
        await vscode.workspace.getConfiguration("java.project.explorer").update(
            "showNonJavaResources",
            originalShowNonJavaResources,
            vscode.ConfigurationTarget.Workspace,
        );
    });

    test("Merges generated source roots into the physical build output tree", async function() {
        const projectNode = await getProjectNode();
        const projectChildren = await projectNode.getChildren();
        const targetFolder = projectChildren.find((node: DataNode) =>
            node instanceof FolderNode && node.name === "target") as FolderNode;

        assert.ok(targetFolder, `The physical target folder should be visible.\n${printNodes(projectChildren)}`);
        assert.ok(!projectChildren.find((node: DataNode) =>
            node instanceof PackageRootNode && node.path?.endsWith("/target/generated-sources/demo")),
            "The generated source root should not be duplicated at the project level");

        const targetChildren = await targetFolder.getChildren();
        assert.ok(targetChildren.find((node: DataNode) =>
            node instanceof FileNode && node.name === "build-info.txt"),
            "Non-Java build output should remain visible");

        const generatedSourcesFolder = targetChildren.find((node: DataNode) =>
            node instanceof FolderNode && node.name === "generated-sources") as FolderNode;
        assert.ok(generatedSourcesFolder, "The generated-sources ancestor should be visible under target");

        const generatedSourcesChildren = await generatedSourcesFolder.getChildren();
        const demoRoot = generatedSourcesChildren.find((node: DataNode) =>
            node instanceof PackageRootNode && node.getDisplayName() === "demo") as PackageRootNode;
        assert.ok(demoRoot, "The generated Java source root should be nested under its physical ancestors");
        assert.ok(demoRoot.path?.endsWith("/target/generated-sources/demo"));
    });

    test("Resolves Java files through the merged build output hierarchy", async function() {
        const workspaceFolder = vscode.workspace.workspaceFolders![0];
        const generatedTypeUri = vscode.Uri.joinPath(
            workspaceFolder.uri,
            "target",
            "generated-sources",
            "demo",
            "com",
            "example",
            "generated",
            "GeneratedApp.java",
        );
        const paths = await Jdtls.resolvePath(generatedTypeUri.toString());

        assert.deepEqual(paths.slice(0, 4).map(path => path.kind), [
            NodeKind.Project,
            NodeKind.Folder,
            NodeKind.Folder,
            NodeKind.PackageRoot,
        ]);
        assert.equal(paths[1].name, "target");
        assert.equal(paths[2].name, "generated-sources");
        assert.equal(paths[3].displayName, "demo");

        const explorer = DependencyExplorer.getInstance(contextManager.context);
        const revealedNode = await explorer.dataProvider.revealPaths(paths);
        assert.ok(revealedNode instanceof PrimaryTypeNode, "The generated Java type should be revealable");
        assert.equal(revealedNode.name, "GeneratedApp");
    });

    test("Keeps generated source roots visible when non-Java resources are hidden", async function() {
        await vscode.workspace.getConfiguration("java.project.explorer").update(
            "showNonJavaResources",
            false,
            vscode.ConfigurationTarget.Workspace,
        );
        await vscode.commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH);

        try {
            const projectNode = await getProjectNode();
            const projectChildren = await projectNode.getChildren();
            assert.ok(!projectChildren.find((node: DataNode) =>
                node instanceof FolderNode && node.name === "target"),
                "The physical target folder should be hidden");
            assert.ok(projectChildren.find((node: DataNode) =>
                node instanceof PackageRootNode && node.path?.endsWith("/target/generated-sources/demo")),
                "The Java source root should remain visible at the project level");
        } finally {
            await vscode.workspace.getConfiguration("java.project.explorer").update(
                "showNonJavaResources",
                true,
                vscode.ConfigurationTarget.Workspace,
            );
            await vscode.commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH);
        }
    });
});

async function getProjectNode(): Promise<ProjectNode> {
    const explorer = DependencyExplorer.getInstance(contextManager.context);
    const deadline = Date.now() + 60 * 1000;
    let roots = await explorer.dataProvider.getChildren();
    while (Date.now() < deadline) {
        const projectNode = roots?.find((node: DataNode) =>
            node instanceof ProjectNode && node.name === "generated-sources-tree") as ProjectNode;
        if (projectNode) {
            return projectNode;
        }
        await sleep(1000);
        await vscode.commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH);
        roots = await explorer.dataProvider.getChildren();
    }

    assert.fail(`The generated-sources-tree project was not imported.\n${printNodes(roots || [])}`);
}
