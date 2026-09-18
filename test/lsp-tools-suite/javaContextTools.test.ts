// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vm from "vm";
import * as vscode from "vscode";

interface Input {
    query?: string;
    uri?: string;
    limit?: number;
}

interface ResultSymbol {
    documentUri: string;
    file?: string;
    outlineSupported: boolean;
    unsupportedReason?: string;
    selectionRange: { startLine: number; endLine: number };
    readFileInput?: unknown;
    readFileRange: { offset: number; limit: number };
    children?: ResultSymbol[];
}

interface Payload {
    results: ResultSymbol[];
    symbols: ResultSymbol[];
    documentUri: string;
    file: string;
    reason?: string;
    message?: string;
    errorCode?: string;
    hint?: string;
    total?: number;
    truncated?: boolean;
}

suite("Java LSP tool contracts", () => {
    let tools: Map<string, vscode.LanguageModelTool<Input>>;
    let events: Record<string, string | number>[];
    let calls: { command: string; argument: unknown }[];
    let folders: vscode.WorkspaceFolder[];
    let ready: boolean;
    let statError: Error | undefined;
    let provider: (command: string, argument: unknown) => unknown;
    const root = vscode.Uri.file(path.join(os.tmpdir(), "java-lsp-contract"));
    const source = vscode.Uri.joinPath(root, "src", "Main.java");

    setup(() => {
        tools = new Map();
        events = [];
        calls = [];
        folders = [{ uri: root, name: "project", index: 0 }];
        ready = true;
        statError = undefined;
        provider = () => [];
        // Keep real VS Code URI/range/error/result types while isolating providers, readiness and telemetry.
        const api = {
            ...vscode,
            workspace: {
                get workspaceFolders() { return folders; },
                getWorkspaceFolder: (uri: vscode.Uri) => folders.find(folder => {
                    const uriPath = process.platform === "win32" ? uri.path.toLowerCase() : uri.path;
                    const folderPath = process.platform === "win32" ? folder.uri.path.toLowerCase() : folder.uri.path;
                    return uri.scheme === folder.uri.scheme && uri.authority === folder.uri.authority
                        && (uriPath === folderPath || uriPath.startsWith(folderPath + "/"));
                }),
                fs: {
                    stat: async () => {
                        if (statError) {
                            throw statError;
                        }
                        return { type: vscode.FileType.File, ctime: 0, mtime: 0, size: 100 };
                    },
                },
            },
            commands: {
                executeCommand: async (command: string, argument: unknown) => {
                    calls.push({ command, argument });
                    return provider(command, argument);
                },
            },
            lm: {
                registerTool: (name: string, tool: vscode.LanguageModelTool<Input>) => {
                    tools.set(name, tool);
                    return new vscode.Disposable(() => tools.delete(name));
                },
            },
        };
        const exports = { registerJavaContextTools: (_context: { subscriptions: vscode.Disposable[] }) => undefined };
        const dependencies: Record<string, unknown> = {
            vscode: api,
            path,
            "../../commands": { Commands: {} },
            "../../languageServerApi/languageServerApiManager": {
                languageServerApiManager: { isFullyReady: () => ready },
            },
            "vscode-extension-telemetry-wrapper": {
                sendInfo: (_name: string, properties: Record<string, string | number>) => events.push(properties),
            },
        };
        const code = fs.readFileSync(path.resolve(__dirname, "../../src/copilot/tools/javaContextTools.js"), "utf8");
        vm.runInNewContext(code, {
            exports,
            require: (id: string) => {
                assert.ok(id in dependencies, `Unexpected dependency: ${id}`);
                return dependencies[id];
            },
            process,
            Error,
        });
        exports.registerJavaContextTools({ subscriptions: [] });
    });

    async function invoke(name: string, input: Input): Promise<Payload> {
        const tool = tools.get(name);
        assert.ok(tool);
        const cancellation = new vscode.CancellationTokenSource();
        try {
            const result = await tool.invoke({ input, toolInvocationToken: undefined }, cancellation.token);
            assert.ok(result);
            const part = result.content[0];
            assert.ok(part instanceof vscode.LanguageModelTextPart);
            return JSON.parse(part.value);
        } finally {
            cancellation.dispose();
        }
    }

    function symbol(uri = source): vscode.SymbolInformation {
        return new vscode.SymbolInformation("Main", vscode.SymbolKind.Class, "example",
            new vscode.Location(uri, new vscode.Range(4, 6, 4, 10)));
    }

    function outline(): vscode.DocumentSymbol {
        return new vscode.DocumentSymbol("Main", "", vscode.SymbolKind.Class,
            new vscode.Range(2, 0, 20, 0), new vscode.Range(4, 6, 4, 10));
    }

    test("registers only the two existing tools", () => {
        assert.deepStrictEqual([...tools.keys()], ["lsp_java_getFileStructure", "lsp_java_findSymbol"]);
    });

    test("keeps name ranges separate from full declaration read ranges", async () => {
        const fileOutline = outline();
        fileOutline.children = [new vscode.DocumentSymbol("run", "", vscode.SymbolKind.Method,
            new vscode.Range(7, 0, 12, 5), new vscode.Range(7, 9, 7, 12))];
        provider = command => command === "vscode.executeWorkspaceSymbolProvider" ? [symbol()] : [fileOutline];
        const found = await invoke("lsp_java_findSymbol", { query: "Main" });
        const hit = found.results[0];
        assert.deepStrictEqual(hit.selectionRange, { startLine: 5, endLine: 5 });
        assert.strictEqual(hit.readFileInput, undefined);
        assert.strictEqual(hit.documentUri, source.toString());
        assert.strictEqual(hit.file, source.fsPath);
        assert.strictEqual(hit.outlineSupported, true);
        const structured = await invoke("lsp_java_getFileStructure", { uri: hit.documentUri });
        assert.strictEqual(structured.file, source.fsPath);
        assert.deepStrictEqual(structured.symbols[0].readFileRange, { offset: 3, limit: 18 });
        assert.deepStrictEqual(structured.symbols[0].children?.[0].readFileRange, { offset: 8, limit: 6 });
        assert.strictEqual(calls.length, 2, "No eager per-candidate document-symbol queries");
    });

    test("round-trips exact URIs and paths in multi-root workspaces", async () => {
        const other = vscode.Uri.joinPath(root, "..", "other");
        folders.push({ uri: other, name: "other", index: 1 });
        const file = vscode.Uri.joinPath(other, "src", "A B.java");
        provider = command => command === "vscode.executeWorkspaceSymbolProvider" ? [symbol(file)] : [outline()];
        const found = await invoke("lsp_java_findSymbol", { query: "Main" });
        for (const uri of [found.results[0].documentUri, file.fsPath, "other/src/A B.java"]) {
            const result = await invoke("lsp_java_getFileStructure", { uri });
            assert.strictEqual(result.documentUri, file.toString());
        }
    });

    test("rejects ambiguous display-name paths but accepts exact URIs", async () => {
        folders.push({ uri: vscode.Uri.joinPath(root, "..", "other"), name: "project", index: 1 });
        const failed = await invoke("lsp_java_getFileStructure", { uri: "project/src/Main.java" });
        assert.strictEqual(failed.errorCode, "ambiguousWorkspacePath");
        assert.strictEqual(calls.length, 0);
        provider = () => [outline()];
        assert.strictEqual((await invoke("lsp_java_getFileStructure", { uri: source.toString() })).documentUri, source.toString());
    });

    for (const [uri, reason] of [
        [vscode.Uri.parse("jdt://contents/library.jar/example/Main.class?x=1"), "unsupportedUriScheme"],
        [vscode.Uri.parse("vscode-remote://ssh-remote+host/project/Main.java"), "unsupportedUriScheme"],
        [vscode.Uri.parse("untitled:Main.java"), "unsupportedUriScheme"],
        [vscode.Uri.joinPath(root, "..", "outside", "Main.java"), "outsideWorkspace"],
    ] as const) {
        test(`preserves ${uri.scheme} URI while reporting ${reason}`, async () => {
            provider = () => [symbol(uri)];
            const found = await invoke("lsp_java_findSymbol", { query: "Main" });
            assert.strictEqual(found.results[0].documentUri, uri.toString());
            assert.strictEqual(found.results[0].outlineSupported, false);
            assert.strictEqual(found.results[0].unsupportedReason, reason);
            assert.strictEqual(found.results[0].file, undefined);
            const failed = await invoke("lsp_java_getFileStructure", { uri: uri.toString() });
            assert.strictEqual(failed.errorCode, reason);
            assert.strictEqual(calls.length, 1, "Unsupported outline must not invoke a provider");
        });
    }

    test("rejects parent traversal and handles missing workspaces", async () => {
        assert.strictEqual((await invoke("lsp_java_getFileStructure", { uri: "../outside/Main.java" })).errorCode, "outsideWorkspace");
        folders = [];
        assert.strictEqual((await invoke("lsp_java_getFileStructure", { uri: source.toString() })).errorCode, "noWorkspaceFolder");
        assert.strictEqual(calls.length, 0);
    });

    for (const [error, code] of [
        [vscode.FileSystemError.FileNotFound(), "fileNotFound"],
        [vscode.FileSystemError.FileNotADirectory(), "fileNotFound"],
        [vscode.FileSystemError.NoPermissions(), "permissionDenied"],
        [vscode.FileSystemError.Unavailable(), "fileSystemUnavailable"],
    ] as const) {
        test(`returns actionable ${code} without misclassifying filesystem errors`, async () => {
            statError = error;
            const failed = await invoke("lsp_java_getFileStructure", { uri: source.toString() });
            assert.strictEqual(failed.errorCode, code);
            assert.ok(failed.hint);
            assert.strictEqual(calls.length, 0);
            const event = events[events.length - 1];
            assert.strictEqual(event.errorCode, code);
            assert.strictEqual(event.status, "error");
            assert.ok(Number(event.responseCharCount) > 0);
        });
    }

    test("propagates unexpected I/O failures and records an error", async () => {
        statError = new Error("unexpected failure");
        await assert.rejects(invoke("lsp_java_getFileStructure", { uri: source.toString() }), /unexpected failure/);
        assert.strictEqual(events[events.length - 1].errorCode, "unexpectedError");
    });

    test("does not diagnose indexing from the server initialization flag", async () => {
        ready = false;
        for (const name of ["lsp_java_findSymbol", "lsp_java_getFileStructure"]) {
            const notReady = await invoke(name, { query: "Main", uri: source.toString() });
            assert.strictEqual(notReady.reason, "serverNotFullyReady");
            assert.ok(!notReady.message?.includes("indexing"));
            assert.strictEqual(events[events.length - 1].emptyReason, "serverNotFullyReady");
        }
        ready = true;
        const result = await invoke("lsp_java_findSymbol", { query: "field" });
        assert.strictEqual(result.reason, "workspaceSymbolNoMatch");
        assert.ok(result.message?.includes("fields are not searched"));
        assert.ok(result.message?.includes("do not prove"));
    });

    test("normalizes an empty qualified lookup once and never rewrites user settings", async () => {
        provider = (_command, argument) => argument === "Main" ? [symbol()] : [];
        const found = await invoke("lsp_java_findSymbol", { query: "example.Main" });
        assert.strictEqual(found.results.length, 1);
        assert.deepStrictEqual(calls.map(call => call.argument), ["example.Main", "Main"]);
        assert.strictEqual(events[events.length - 1].retried, "true");
        assert.ok(Number(events[events.length - 1].initialQueryDurationMs) >= 0);
        assert.ok(Number(events[events.length - 1].retryQueryDurationMs) >= 0);
    });

    test("does not retry unchanged queries and rejects blank queries", async () => {
        await invoke("lsp_java_findSymbol", { query: "missing" });
        assert.strictEqual(calls.length, 1);
        await invoke("lsp_java_findSymbol", { query: "   " });
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(events[events.length - 1].errorCode, "emptyQuery");
    });

    test("reports output truncation without claiming a provider-side search cap", async () => {
        provider = () => [symbol(), symbol(), symbol()];
        const result = await invoke("lsp_java_findSymbol", { query: "Main", limit: 1 });
        assert.strictEqual(result.results.length, 1);
        assert.strictEqual(result.total, 3);
        assert.strictEqual(result.truncated, true);
        assert.strictEqual(calls[0].argument, "Main");
    });

    test("accepts file URIs without an authority delimiter", async () => {
        provider = () => [outline()];
        const result = await invoke("lsp_java_getFileStructure", { uri: `file:${source.path}` });
        assert.strictEqual(result.documentUri, source.toString());
    });

    test("records provider failures without returning a successful empty result", async () => {
        provider = () => { throw new Error("provider failed"); };
        await assert.rejects(invoke("lsp_java_findSymbol", { query: "Main" }), /provider failed/);
        assert.strictEqual(events[events.length - 1].status, "error");
        assert.ok(Number(events[events.length - 1].initialQueryDurationMs) >= 0);
        assert.strictEqual(events[events.length - 1].retryQueryDurationMs, 0);
    });

    test("reports both node-count and depth truncation for outlines", async () => {
        const top = outline();
        let current = top;
        for (let depth = 0; depth < 5; depth++) {
            const child = outline();
            current.children = [child];
            current = child;
        }
        provider = () => [top];
        const capped = await invoke("lsp_java_getFileStructure", { uri: source.toString(), limit: 1 });
        assert.strictEqual(capped.truncated, true);
        assert.strictEqual(capped.symbols[0].children?.length, 0);
        const deep = await invoke("lsp_java_getFileStructure", { uri: source.toString(), limit: 60 });
        assert.strictEqual(deep.truncated, true);
        assert.strictEqual(events[events.length - 1].resultCount, 4);
        provider = () => [outline()];
        assert.strictEqual((await invoke("lsp_java_getFileStructure", { uri: source.toString() })).truncated, undefined);
    });
});
