// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as path from "path";
import { commands, InputBoxOptions, QuickPickItem, Uri, window, workspace, WorkspaceEdit } from "vscode";
import { Commands, INodeData, Jdtls, NodeKind, ProjectNode } from "../../extension.bundle";
import { setupTestEnv } from "../shared";

interface ISourceRootPickItem extends QuickPickItem {
    fsPath: string;
}

suite("Project Creation Source Root Tests", () => {
    const originalExecuteCommand = commands.executeCommand;
    const originalGetConfiguration = workspace.getConfiguration;
    const originalShowQuickPick = window.showQuickPick;
    const originalShowInputBox = window.showInputBox;
    const originalApplyEdit = workspace.applyEdit;
    const originalShowTextDocument = window.showTextDocument;
    const projectPath = path.resolve(__dirname, "new-command-project");
    const projectUri = Uri.file(projectPath).toString();
    let project: ProjectNode;
    let packageData: INodeData[];
    let packageQueries: object[];
    let rootChoices: ISourceRootPickItem[][];
    let selectedRoot: string | undefined;
    let inputValue: string | undefined;
    let inputPrompts: InputBoxOptions[];
    let appliedEdits: WorkspaceEdit[];
    let childReads: number;
    let excludes: { [pattern: string]: boolean };

    suiteSetup(setupTestEnv);

    setup(() => {
        packageData = [];
        packageQueries = [];
        rootChoices = [];
        selectedRoot = undefined;
        inputValue = undefined;
        inputPrompts = [];
        appliedEdits = [];
        childReads = 0;
        excludes = {};
        project = new ProjectNode({ kind: NodeKind.Project, name: "new-command-project", uri: projectUri });
        project.getChildren = async () => {
            childReads++;
            return [];
        };
        commands.executeCommand = async <T>(command: string, ...args: any[]): Promise<T> => {
            if (command === Commands.EXECUTE_WORKSPACE_COMMAND && args[0] === Commands.JAVA_GETPACKAGEDATA
                    && args[1]?.projectUri === projectUri) {
                packageQueries.push({ ...args[1] });
                return packageData as unknown as T;
            }
            if (command === Commands.EXECUTE_WORKSPACE_COMMAND && args[0] === Commands.LIST_SOURCEPATHS) {
                return { status: true, data: [] } as unknown as T;
            }
            return originalExecuteCommand<T>(command, ...args);
        };
        workspace.getConfiguration = (section, scope) => {
            const configuration = originalGetConfiguration(section, scope);
            if (section !== "java.project.explorer" && !(section === "files" && scope instanceof Uri && scope.toString() === projectUri)) {
                return configuration;
            }
            return {
                ...configuration,
                get: ((key: string, defaultValue?: unknown) => {
                    if (section === "java.project.explorer" && key === "showNonJavaResources") {
                        return true;
                    }
                    if (section === "files" && key === "exclude") {
                        return excludes;
                    }
                    return configuration.get(key, defaultValue);
                }) as typeof configuration.get,
            };
        };
        window.showQuickPick = (async (items: readonly (string | QuickPickItem)[] | Thenable<readonly (string | QuickPickItem)[]>) => {
            const roots = (await items).filter((item): item is ISourceRootPickItem =>
                typeof item !== "string" && "fsPath" in item && typeof item.fsPath === "string");
            rootChoices.push(roots);
            return roots.find(item => item.label === selectedRoot);
        }) as typeof window.showQuickPick;
        window.showInputBox = async options => {
            inputPrompts.push(options!);
            return inputValue;
        };
        // Capture the edit without creating files or opening an editor.
        workspace.applyEdit = async edit => {
            appliedEdits.push(edit);
            return true;
        };
        window.showTextDocument = async () => undefined!;
    });

    teardown(() => {
        commands.executeCommand = originalExecuteCommand;
        workspace.getConfiguration = originalGetConfiguration;
        window.showQuickPick = originalShowQuickPick;
        window.showInputBox = originalShowInputBox;
        workspace.applyEdit = originalApplyEdit;
        window.showTextDocument = originalShowTextDocument;
    });

    test("Class creation queries logical roots for the selected project instead of tree children", async () => {
        const generated = sourceRoot("target/generated-sources/demo");
        generated.buildOutputPath = [
            { kind: NodeKind.Folder, name: "target", uri: Uri.file(path.join(projectPath, "target")).toString() },
            { ...generated, displayName: "demo" },
        ];
        packageData = [generated.buildOutputPath[0], generated, sourceRoot("src/main/resources")];

        await createClass();

        assert.deepStrictEqual(packageQueries, [{ kind: NodeKind.Project, projectUri, mergeBuildOutputSourceRoots: false }]);
        assert.strictEqual(childReads, 0, "Source-root discovery must not depend on the visible tree");
        assert.strictEqual(rootChoices.length, 0, "A single Java source root must not show a picker");
        assertCreatedUnder(Uri.parse(generated.uri!).fsPath);
    });

    test("Multiple roots retain logical labels, resource filtering, exclusion filtering, and linked roots", async () => {
        const main = sourceRoot("src/main/java");
        const generated = sourceRoot("target/generated-sources/demo");
        generated.displayName = "demo";
        const linked = sourceRoot("linked-sources", path.resolve(projectPath, "..", "linked-sources"));
        const excluded = sourceRoot("excluded/java");
        excludes = { "**/excluded/**": true };
        packageData = [
            generated, excluded, sourceRoot("src/test/resources"), main, linked, sourceRoot("src/main/resources"),
        ];
        selectedRoot = linked.name;

        await createClass();

        assert.deepStrictEqual(rootChoices, [[linked, main, generated].map(root => ({
            label: root.name,
            fsPath: Uri.parse(root.uri!).fsPath,
        }))]);
        assertCreatedUnder(Uri.parse(linked.uri!).fsPath);
        assert.strictEqual(childReads, 0);
    });

    for (const command of [Commands.VIEW_PACKAGE_NEW_JAVA_CLASS, Commands.VIEW_PACKAGE_NEW_JAVA_PACKAGE]) {
        test(`Cancelling source-root selection aborts ${command}`, async () => {
            packageData = [sourceRoot("src/main/java"), sourceRoot("target/generated-sources/demo")];

            await runCreationCommand(command);

            assert.strictEqual(rootChoices.length, 1);
            assert.strictEqual(inputPrompts.length, 0, "Cancellation must not advance to the name prompt");
            assert.strictEqual(appliedEdits.length, 0);
        });
    }

    test("Unmanaged projects derive their root from a logical qualified package", async () => {
        const sourcePath = path.join(projectPath, "unmanaged-source");
        packageData = [{
            kind: NodeKind.Package,
            name: "com.example",
            displayName: "example",
            uri: Uri.file(path.join(sourcePath, "com", "example")).toString(),
        }];

        await createClass();

        assertCreatedUnder(sourcePath);
        assert.strictEqual(rootChoices.length, 0);
    });

    test("Projects with only the default package retain the project-directory fallback", async () => {
        packageData = [{
            kind: NodeKind.PrimaryType,
            name: "Existing",
            uri: Uri.file(path.join(projectPath, "Existing.java")).toString(),
        }];

        await createClass();

        assertCreatedUnder(projectPath);
        assert.strictEqual(rootChoices.length, 0);
    });

    test("Default display queries still merge roots while explicit logical queries retain them", async () => {
        const target: INodeData = {
            kind: NodeKind.Folder,
            name: "target",
            uri: Uri.file(path.join(projectPath, "target")).toString(),
        };
        const generated = sourceRoot("target/generated-sources/demo");
        generated.buildOutputPath = [target, { ...generated, displayName: "demo" }];
        packageData = [target, generated];

        assert.deepStrictEqual(await Jdtls.getPackageData({ kind: NodeKind.Project, projectUri }), [target]);
        assert.deepStrictEqual(await Jdtls.getPackageData({
            kind: NodeKind.Project,
            projectUri,
            mergeBuildOutputSourceRoots: false,
        }), [target, generated]);
        assert.deepStrictEqual(packageQueries, [
            { kind: NodeKind.Project, projectUri, mergeBuildOutputSourceRoots: true },
            { kind: NodeKind.Project, projectUri, mergeBuildOutputSourceRoots: false },
        ]);
    });

    function sourceRoot(name: string, fsPath = path.join(projectPath, ...name.split("/"))): INodeData {
        return { kind: NodeKind.PackageRoot, name, uri: Uri.file(fsPath).toString() };
    }

    async function createClass(): Promise<void> {
        inputValue = "NewType";
        await runCreationCommand(Commands.VIEW_PACKAGE_NEW_JAVA_CLASS);
    }

    async function runCreationCommand(command: string): Promise<void> {
        await commands.executeCommand(command, project);
        // The registered creation commands do not await their async helpers.
        await new Promise<void>(resolve => setImmediate(resolve));
    }

    function assertCreatedUnder(root: string): void {
        assert.strictEqual(appliedEdits.length, 1);
        assert.deepStrictEqual(appliedEdits[0].entries().map(([uri]) => uri.fsPath), [path.join(root, "NewType.java")]);
    }
});
