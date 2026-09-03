// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as vscode from "vscode";
import {
    Commands, contextManager, DependencyExplorer, FileNode, Jdtls, ProjectNode, WorkspaceNode,
} from "../../extension.bundle";
import { setupTestEnv } from "../shared";

// tslint:disable: only-arrow-functions
suite("Multiple Project View Tests", () => {

    suiteSetup(async () => {
        await setupTestEnv();
        const javaExtension = vscode.extensions.getExtension("redhat.java");
        assert.ok(javaExtension, "Language Support for Java should be installed");
        const javaApi = await javaExtension!.activate();
        await javaApi.serverReady();
        await vscode.commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH);
    });

    test("Does not add project roots progressively in a multi-root workspace", async function() {
        const explorer = DependencyExplorer.getInstance(contextManager.context);
        const roots = await explorer.dataProvider.getChildren();
        const expectedRootCount = vscode.workspace.workspaceFolders?.length || 0;

        assert.equal(roots?.length, expectedRootCount, "Each workspace folder should have one root node");
        assert.ok(roots?.every(root => root instanceof WorkspaceNode), "All roots should be workspace nodes");
        const nonJavaRoot = roots?.find(root =>
            root instanceof WorkspaceNode && root.name === "non-java") as WorkspaceNode | undefined;
        assert.ok(nonJavaRoot, "The non-Java workspace folder should have a root node");
        const nonJavaChildren = await nonJavaRoot.getChildren();
        const packageJson = nonJavaChildren.find((node) => node instanceof FileNode && node.name === "package.json");
        assert.ok(packageJson, "The non-Java workspace folder should expose its filesystem resources");

        const projects = await explorer.dataProvider.getRootProjects();
        assert.ok(projects.every((node) => node instanceof ProjectNode),
            "Filesystem resources should not be returned as root projects");
        const project = projects.find((node): node is ProjectNode =>
            node instanceof ProjectNode && Boolean(node.uri));
        assert.ok(project?.uri, "At least one Java project should be available");

        explorer.dataProvider.addProgressiveProjects([project!.uri!]);

        const updatedRoots = await explorer.dataProvider.getChildren();
        assert.equal(updatedRoots?.length, expectedRootCount, "Progressive updates should not add project roots");
        assert.ok(updatedRoots?.every(root => root instanceof WorkspaceNode), "All roots should remain workspace nodes");
    });

    test("Hides workspace folders without Java projects when non-Java resources are hidden", async function() {
        const configuration = vscode.workspace.getConfiguration("java.project.explorer");
        const originalWorkspaceValue = configuration.inspect<boolean>("showNonJavaResources")?.workspaceValue;

        await configuration.update("showNonJavaResources", false, vscode.ConfigurationTarget.Workspace);
        try {
            await vscode.commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH);

            const folders = vscode.workspace.workspaceFolders || [];
            const expectedNames: string[] = [];
            for (const folder of folders) {
                if ((await Jdtls.getProjects(folder.uri.toString())).length > 0) {
                    expectedNames.push(folder.name);
                }
            }

            assert.ok(expectedNames.includes("maven"), "The Maven workspace folder should contain a Java project");
            assert.ok(!expectedNames.includes("non-java"), "The non-Java fixture should not contain a Java project");

            const explorer = DependencyExplorer.getInstance(contextManager.context);
            const roots = await explorer.dataProvider.getChildren();
            assert.deepStrictEqual(
                roots?.map(root => root.getDisplayName()),
                expectedNames,
                "Only workspace folders containing Java projects should be shown",
            );
            assert.ok(roots?.every(root => root instanceof WorkspaceNode), "All roots should remain workspace nodes");
        } finally {
            await configuration.update(
                "showNonJavaResources",
                originalWorkspaceValue,
                vscode.ConfigurationTarget.Workspace,
            );
            await vscode.commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH);
        }
    });

    test("Applies boolean and conditional files.exclude to non-Java workspace folders", async function() {
        const configuration = vscode.workspace.getConfiguration("files");
        const originalWorkspaceValue = configuration.inspect<{
            [pattern: string]: boolean | { when: string };
        }>("exclude")?.workspaceValue;
        const nonJavaFolder = vscode.workspace.workspaceFolders?.find((folder) => folder.name === "non-java");
        assert.ok(nonJavaFolder, "The non-Java workspace folder should exist");
        const standaloneJs = vscode.Uri.joinPath(nonJavaFolder.uri, "standalone.js");
        const pairedJs = vscode.Uri.joinPath(nonJavaFolder.uri, "paired.js");
        const pairedTs = vscode.Uri.joinPath(nonJavaFolder.uri, "paired.ts");
        const temporaryFiles = [standaloneJs, pairedJs, pairedTs];

        await Promise.all(temporaryFiles.map((uri) => vscode.workspace.fs.writeFile(uri, new Uint8Array())));
        try {
            await configuration.update("exclude", {
                "package.json": true,
                "**/*.js": { when: "$(basename).ts" },
            }, vscode.ConfigurationTarget.Workspace);
            await vscode.commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH);

            const explorer = DependencyExplorer.getInstance(contextManager.context);
            const roots = await explorer.dataProvider.getChildren();
            const nonJavaRoot = roots?.find(root =>
                root instanceof WorkspaceNode && root.name === "non-java") as WorkspaceNode | undefined;
            assert.ok(nonJavaRoot, "The non-Java workspace folder should have a root node");
            const childNames = (await nonJavaRoot.getChildren()).map((node) => node.getDisplayName());
            assert.ok(!childNames.includes("package.json"),
                "Excluded filesystem resources should not appear in the Java Projects explorer");
            assert.ok(childNames.includes("standalone.js"),
                "A conditional exclusion should keep files whose sibling does not exist");
            assert.ok(!childNames.includes("paired.js"),
                "A conditional exclusion should hide files whose configured sibling exists");
            assert.ok(childNames.includes("paired.ts"), "The matching sibling should remain visible");
        } finally {
            await configuration.update("exclude", originalWorkspaceValue, vscode.ConfigurationTarget.Workspace);
            await Promise.all(temporaryFiles.map((uri) => vscode.workspace.fs.delete(uri)));
            await vscode.commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH);
        }
    });

    test("Does not add project roots while cached multi-root roots are stale", async function() {
        const explorer = DependencyExplorer.getInstance(contextManager.context);
        const roots = await explorer.dataProvider.getChildren();
        const folders = vscode.workspace.workspaceFolders;
        assert.ok(folders && folders.length > 1, "The test requires a multi-root workspace");
        assert.ok(roots?.every(root => root instanceof WorkspaceNode), "All cached roots should be workspace nodes");

        const projects = await explorer.dataProvider.getRootProjects();
        const project = projects.find((node): node is ProjectNode =>
            node instanceof ProjectNode && Boolean(node.uri));
        assert.ok(project?.uri, "At least one Java project should be available");

        const removedFolders = folders!.slice(1);
        const workspaceFoldersChanged = updateWorkspaceFoldersAndWait(1, removedFolders.length, [],
            "The workspace should switch to a single folder");

        try {
            assert.equal(vscode.workspace.workspaceFolders?.length, 1, "The workspace should have one folder");
            explorer.dataProvider.addProgressiveProjects([project!.uri!]);

            const updatedRoots = await explorer.dataProvider.getChildren();
            assert.equal(updatedRoots?.length, roots?.length, "Stale cached roots should not be mixed with project roots");
            assert.ok(updatedRoots?.every(root => root instanceof WorkspaceNode),
                "Cached workspace roots should remain unchanged until refresh");
        } finally {
            await workspaceFoldersChanged;
            await updateWorkspaceFoldersAndWait(1, 0,
                removedFolders.map(folder => ({ uri: folder.uri })),
                "The removed workspace folders should be restored");
        }
    });
});

async function updateWorkspaceFoldersAndWait(
    start: number,
    deleteCount: number,
    foldersToAdd: { uri: vscode.Uri; name?: string }[],
    failureMessage: string,
): Promise<void> {
    let resolveChange: () => void;
    const changed = new Promise<void>((resolve) => resolveChange = resolve);
    const listener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
        listener.dispose();
        resolveChange();
    });

    if (!vscode.workspace.updateWorkspaceFolders(start, deleteCount, ...foldersToAdd)) {
        listener.dispose();
        assert.fail(failureMessage);
    }

    await changed;
}
