// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as vscode from "vscode";
import {
    Commands,
    ContainerNode,
    contextManager,
    DataNode,
    DependencyExplorer,
    FileNode,
    FolderNode,
    Jdtls,
    languageServerApiManager,
    NodeKind,
    PackageNode,
    PackageRootKind,
    PackageRootNode,
    PrimaryTypeNode,
    ProjectNode,
} from "../../extension.bundle";
import { ExplorerNode } from "../../src/views/explorerNode";
import { printNodes, setupTestEnv } from "../shared";
import { sleep } from "../util";

type FileExcludes = { [pattern: string]: boolean | { when: string } };

const generatedRootPath = "target/generated-sources/demo";

// tslint:disable: only-arrow-functions
suite("Generated Source Tree Tests", () => {
    let originalShowNonJavaResources: boolean | undefined;
    let originalFileExcludes: FileExcludes | undefined;
    let originalPackagePresentation: string | undefined;

    suiteSetup(async () => {
        originalShowNonJavaResources = vscode.workspace.getConfiguration("java.project.explorer")
            .inspect<boolean>("showNonJavaResources")?.workspaceValue;
        originalFileExcludes = vscode.workspace.getConfiguration("files").inspect<FileExcludes>("exclude")?.workspaceValue;
        originalPackagePresentation = vscode.workspace.getConfiguration("java.dependency")
            .inspect<string>("packagePresentation")?.workspaceValue;
        await setupTestEnv();
        await languageServerApiManager.ready();
    });

    teardown(async () => {
        await vscode.workspace.getConfiguration("java.project.explorer").update(
            "showNonJavaResources",
            originalShowNonJavaResources,
            vscode.ConfigurationTarget.Workspace,
        );
        await vscode.workspace.getConfiguration("files").update(
            "exclude",
            originalFileExcludes,
            vscode.ConfigurationTarget.Workspace,
        );
        await vscode.workspace.getConfiguration("java.dependency").update(
            "packagePresentation",
            originalPackagePresentation,
            vscode.ConfigurationTarget.Workspace,
        );
        await vscode.commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH);
    });

    test("Preserves record contexts for ordinary source roots and binary dependencies", async function() {
        const project = await getProjectNode();
        const container = new ContainerNode({ kind: NodeKind.Container, name: "Dependencies" }, project, project);
        for (const entryKind of [PackageRootKind.K_SOURCE, PackageRootKind.K_BINARY]) {
            const allowsRecords = entryKind === PackageRootKind.K_SOURCE;
            const rootData = {
                kind: NodeKind.PackageRoot,
                name: allowsRecords ? "src/main/java" : "dependency.jar",
                entryKind,
                attributes: new Map<string, string>(),
            };
            const root = new PackageRootNode(rootData, allowsRecords ? project : container, project);
            const packageNode = new PackageNode({ kind: NodeKind.Package, name: "example" }, root, project, root);
            const type = new PrimaryTypeNode({ kind: NodeKind.PrimaryType, name: "Example" }, packageNode, root);

            assert.equal(root.computeContextValue()?.includes("+allowRecord"), allowsRecords,
                `${rootData.name} should preserve its source/binary root context`);
            assert.equal(type.computeContextValue()?.includes("+allowRecord"), allowsRecords,
                `${rootData.name} should allow records only for source types, not binary dependencies`);
        }
    });

    for (const presentation of ["flat", "hierarchical"]) {
        suite(`${presentation} package presentation`, () => {
            setup(async () => {
                await vscode.workspace.getConfiguration("java.dependency").update(
                    "packagePresentation",
                    presentation,
                    vscode.ConfigurationTarget.Workspace,
                );
                await setShowNonJavaResources(true);
                await setFileExcludes({});
                await getProjectNode();
            });

            test("Merges generated roots and preserves reveal and record context across Show/Hide", async function() {
                await assertMergedLayout();
                await assertRevealedType(true);

                const logicalChildren = await Jdtls.getPackageData({
                    kind: NodeKind.Project,
                    projectUri: (await getProjectNode()).uri,
                    mergeBuildOutputSourceRoots: false,
                });
                const logicalRoot = logicalChildren.find(node =>
                    node.kind === NodeKind.PackageRoot && node.path?.endsWith(`/${generatedRootPath}`));
                assert.equal(logicalRoot?.name, generatedRootPath,
                    "Project actions must retain the logical source root even when its tree node is merged");

                await setShowNonJavaResources(false);
                const projectChildren = await (await getProjectNode()).getChildren();
                assert.ok(!projectChildren.some(node => node instanceof FolderNode && node.name === "target"),
                    "Hide should remove the physical target folder");
                assertLogicalRoot(projectChildren);
                await assertRevealedType(false);

                await setShowNonJavaResources(true);
                await assertMergedLayout();
                await assertRevealedType(true);
            });

            test("Falls back around excluded ancestors and merges again when exclusions are removed", async function() {
                for (const pattern of ["**/target", "**/target/generated-sources"]) {
                    await setFileExcludes({ [pattern]: true });
                    const projectChildren = await (await getProjectNode()).getChildren();
                    assertLogicalRoot(projectChildren);

                    if (pattern === "**/target") {
                        assert.ok(!projectChildren.some(node => node instanceof FolderNode && node.name === "target"),
                            "An excluded target folder must stay hidden");
                    } else {
                        const targetChildren = await getFolder(projectChildren, "target").getChildren();
                        assertBuildInfoVisible(targetChildren);
                        assert.ok(!targetChildren.some(node => node.getDisplayName() === "generated-sources"),
                            "An excluded intermediate ancestor must stay hidden");
                        assert.equal(getGeneratedRoots(targetChildren).length, 0,
                            "The fallback root belongs at project level, not directly under target");
                    }

                    await assertRevealedType(false);
                    await setFileExcludes({});
                    await assertMergedLayout();
                    await assertRevealedType(true);
                }
            });

            test("Does not bypass exclusions matching the generated source root itself", async function() {
                for (const pattern of ["**/target/generated-sources/demo", "**/target/**"]) {
                    await setFileExcludes({ [pattern]: true });
                    const projectChildren = await (await getProjectNode()).getChildren();
                    assert.equal(getGeneratedRoots(projectChildren).length, 0,
                        `${pattern} must not expose a fallback source root at project level`);

                    if (pattern === "**/target/**") {
                        const target = projectChildren.find((node): node is FolderNode =>
                            node instanceof FolderNode && node.name === "target");
                        if (target) {
                            const targetChildren = await target.getChildren();
                            assert.equal(getGeneratedRoots(targetChildren).length, 0);
                            assert.ok(!targetChildren.some(node => node.getDisplayName() === "generated-sources"),
                                "The excluded generated-sources folder must not appear in the physical tree");
                            assert.ok(!targetChildren.some(node => node.getDisplayName() === "build-info.txt"),
                                "The descendant exclusion must also hide ordinary build output");
                        }
                    } else {
                        const targetChildren = await getFolder(projectChildren, "target").getChildren();
                        assert.equal(getGeneratedRoots(targetChildren).length, 0,
                            "The excluded root must not appear directly under target");
                        assertBuildInfoVisible(targetChildren);
                        const generatedSourcesChildren = await getFolder(targetChildren, "generated-sources").getChildren();
                        assert.ok(!generatedSourcesChildren.some(node => node.getDisplayName() === "demo"),
                            "The explicitly excluded source root must not appear under its physical ancestors");
                        assert.equal(getGeneratedRoots(generatedSourcesChildren).length, 0);
                    }

                    const paths = await Jdtls.resolvePath(getGeneratedTypeUri().toString());
                    const explorer = DependencyExplorer.getInstance(contextManager.context);
                    const revealedNode = await explorer.dataProvider.revealPaths(paths);
                    assert.ok(!(revealedNode instanceof PrimaryTypeNode),
                        `${pattern} must prevent revealing the excluded generated Java type`);

                    await setFileExcludes({});
                    await assertMergedLayout();
                    await assertRevealedType(true);
                }
            });
        });
    }
});

async function setShowNonJavaResources(show: boolean): Promise<void> {
    await vscode.workspace.getConfiguration("java.project.explorer").update(
        "showNonJavaResources",
        show,
        vscode.ConfigurationTarget.Workspace,
    );
    await vscode.commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH);
}

async function setFileExcludes(excludes: FileExcludes): Promise<void> {
    await vscode.workspace.getConfiguration("files").update("exclude", excludes, vscode.ConfigurationTarget.Workspace);
    await vscode.commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH);
}

function getGeneratedRoots(nodes: ExplorerNode[]): PackageRootNode[] {
    return nodes.filter((node): node is PackageRootNode =>
        node instanceof PackageRootNode && !!node.path?.endsWith(`/${generatedRootPath}`));
}

function getFolder(nodes: ExplorerNode[], name: string): FolderNode {
    const folder = nodes.find((node): node is FolderNode => node instanceof FolderNode && node.name === name);
    assert.ok(folder, `The physical ${name} folder should be visible.\n${printNodes(nodes)}`);
    return folder;
}

function assertBuildInfoVisible(nodes: ExplorerNode[]): void {
    assert.ok(nodes.some(node => node instanceof FileNode && node.name === "build-info.txt"),
        `Non-Java build output should remain visible.\n${printNodes(nodes)}`);
}

function assertLogicalRoot(nodes: ExplorerNode[]): void {
    const roots = getGeneratedRoots(nodes);
    assert.equal(roots.length, 1, `Exactly one generated source root should remain at project level.\n${printNodes(nodes)}`);
    assert.equal(roots[0].getDisplayName(), generatedRootPath, "The fallback root should keep its original display name");
}

async function assertMergedLayout(): Promise<void> {
    const projectChildren = await (await getProjectNode()).getChildren();
    assert.equal(getGeneratedRoots(projectChildren).length, 0,
        "The generated source root should not be duplicated at project level");
    const targetChildren = await getFolder(projectChildren, "target").getChildren();
    assertBuildInfoVisible(targetChildren);
    const generatedSourcesChildren = await getFolder(targetChildren, "generated-sources").getChildren();
    const roots = getGeneratedRoots(generatedSourcesChildren);
    assert.equal(roots.length, 1, "The generated source root should occur once under its physical ancestors");
    assert.equal(roots[0].getDisplayName(), "demo");
}

function getGeneratedTypeUri(): vscode.Uri {
    return vscode.Uri.joinPath(
        vscode.workspace.workspaceFolders![0].uri,
        "target", "generated-sources", "demo", "com", "example", "generated", "GeneratedApp.java",
    );
}

async function assertRevealedType(merged: boolean): Promise<void> {
    const paths = await Jdtls.resolvePath(getGeneratedTypeUri().toString());
    const ancestors = merged ? [NodeKind.Project, NodeKind.Folder, NodeKind.Folder] : [NodeKind.Project];
    assert.deepStrictEqual(paths.map(path => path.kind), [
        ...ancestors, NodeKind.PackageRoot, NodeKind.Package, NodeKind.PrimaryType,
    ], "The resolved path must match the visible tree layout");
    if (merged) {
        assert.equal(paths[1].name, "target");
        assert.equal(paths[2].name, "generated-sources");
    }
    const root = paths[ancestors.length];
    assert.ok(root.path?.endsWith(`/${generatedRootPath}`));
    assert.equal(root.displayName || root.name, merged ? "demo" : generatedRootPath);

    const explorer = DependencyExplorer.getInstance(contextManager.context);
    const revealedNode = await explorer.dataProvider.revealPaths(paths);
    assert.ok(revealedNode instanceof PrimaryTypeNode, "The generated Java type should be revealable");
    assert.equal(revealedNode.name, "GeneratedApp");
    assert.ok(revealedNode.computeContextValue()?.includes("+allowRecord"),
        "GeneratedApp in the Java 17 source root should allow creating records in either layout");
}

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
