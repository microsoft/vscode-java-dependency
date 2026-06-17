/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Java Context Tools — First Batch (Zero-Blocking)
 *
 * These 6 tools are all non-blocking after jdtls is ready:
 *   1. lsp_java_getFileStructure  — LSP documentSymbol
 *   2. lsp_java_findSymbol        — LSP workspaceSymbol
 *   3. lsp_java_getFileImports    — jdtls AST-only command (no type resolution)
 *   4. lsp_java_getTypeAtPosition — LSP hover (post-processed)
 *   5. lsp_java_getCallHierarchy  — LSP call hierarchy
 *   6. lsp_java_getTypeHierarchy  — LSP type hierarchy
 *
 * Design principles:
 *   - Each tool returns < 200 tokens
 *   - Structured JSON output
 *   - No classpath resolution, no dependency download
 */

import * as path from "path";
import * as vscode from "vscode";
import { Commands } from "../../commands";
import { languageServerApiManager } from "../../languageServerApi/languageServerApiManager";
import { sendInfo } from "vscode-extension-telemetry-wrapper";

// Hard caps to keep tool responses within the < 200 token budget.
const MAX_SYMBOL_DEPTH = 3;
const MAX_FILE_STRUCTURE_SYMBOL_NODES = 60;
const DEFAULT_FILE_STRUCTURE_SYMBOL_NODES = 20;
const MAX_CALL_RESULTS = 50;
const MAX_TYPE_RESULTS = 50;
const MAX_IMPORTS = 50;

function toResult(data: unknown): vscode.LanguageModelToolResult {
    const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(text),
    ]);
}

function getResponseCharCount(data: unknown): number {
    return typeof data === "string" ? data.length : JSON.stringify(data, null, 2).length;
}

interface ReadFileInput {
    filePath: string;
    offset: number;
    limit: number;
}

interface ReadFileRange {
    offset: number;
    limit: number;
}

function toInclusiveLineRange(range: vscode.Range): { startLine: number; endLine: number } {
    const startLine = range.start.line + 1;
    const endLine = Math.max(startLine, range.end.character === 0 && range.end.line > range.start.line
        ? range.end.line
        : range.end.line + 1);
    return { startLine, endLine };
}

function toReadFileRange(startLine: number, endLine: number): ReadFileRange {
    return {
        offset: startLine,
        limit: endLine - startLine + 1,
    };
}

function toReadFileInput(filePath: string, startLine: number, endLine: number): ReadFileInput {
    return {
        filePath,
        ...toReadFileRange(startLine, endLine),
    };
}

/**
 * Normalize a workspace-symbol query for a single fallback retry.
 * Strips a fully-qualified package prefix (com.foo.Bar -> Bar), generic parameters
 * (List<String> -> List), and method parameter lists (foo() -> foo). jdtls already
 * performs camel-hump matching, so the contiguous identifier is preserved.
 */
function normalizeSymbolQuery(query: string): string {
    if (!query) {
        return "";
    }
    let q = query.trim();
    // Drop generic parameters and method parens: List<String> / foo(args) -> List / foo
    q = q.replace(/[<(].*$/, "");
    // Drop a fully-qualified package/qualifier prefix: com.foo.Bar / Foo#bar -> Bar / bar
    const lastSep = Math.max(q.lastIndexOf("."), q.lastIndexOf("#"));
    if (lastSep >= 0 && lastSep < q.length - 1) {
        q = q.substring(lastSep + 1);
    }
    return q.trim();
}

function getToolErrorCode(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("No workspace folder")) {
        return "noWorkspaceFolder";
    }
    if (message.includes("Unsupported URI scheme")) {
        return "unsupportedUriScheme";
    }
    if (message.includes("outside the current workspace")) {
        return "outsideWorkspace";
    }
    return "unexpectedError";
}

/**
 * Resolve a file path to a vscode.Uri.
 * Accepts:
 *   - Full file URI:  "file:///home/user/project/src/Main.java"
 *   - Relative path:  "src/main/java/Main.java"
 *   - Absolute path:  "/home/user/project/src/Main.java" or "C:\\Users\\...\\Main.java"
 *
 * Relative paths are resolved against the first workspace folder unless they
 * start with a workspace folder name in a multi-root workspace.
 * The resolved URI must use the file: scheme and fall under a workspace folder.
 */
function resolveFileUri(input: string): vscode.Uri {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        throw new Error("No workspace folder is open.");
    }

    let uri: vscode.Uri;
    const normalizedInput = input.trim();

    if (normalizedInput.includes("://")) {
        // URI string (e.g. "file:///home/user/project/src/Main.java")
        uri = vscode.Uri.parse(normalizedInput);
        if (uri.scheme !== "file") {
            throw new Error(`Unsupported URI scheme "${uri.scheme}". Only file: URIs are allowed.`);
        }
    } else if (path.isAbsolute(normalizedInput)) {
        // Absolute filesystem path (Unix or Windows)
        uri = vscode.Uri.file(normalizedInput);
    } else {
        // Relative path — resolve against a matching workspace folder when
        // asRelativePath included the folder name, otherwise use the first root.
        const normalizedRelativePath = normalizedInput.replace(/\\/g, "/");
        const matchingFolder = folders.find(folder =>
            normalizedRelativePath === folder.name || normalizedRelativePath.startsWith(`${folder.name}/`));
        if (matchingFolder) {
            const pathInFolder = normalizedRelativePath === matchingFolder.name
                ? ""
                : normalizedRelativePath.substring(matchingFolder.name.length + 1);
            uri = vscode.Uri.joinPath(matchingFolder.uri, pathInFolder);
        } else {
            uri = vscode.Uri.joinPath(folders[0].uri, normalizedRelativePath);
        }
    }

    // Ensure the resolved path is under a workspace folder
    const resolvedPath = uri.fsPath.toLowerCase();
    const isUnderWorkspace = folders.some(folder => {
        const folderPath = folder.uri.fsPath.toLowerCase();
        return resolvedPath === folderPath || resolvedPath.startsWith(folderPath + (process.platform === "win32" ? "\\" : "/"));
    });
    if (!isUnderWorkspace) {
        throw new Error("The resolved path is outside the current workspace.");
    }

    return uri;
}

// ============================================================
// Tool 1: lsp_java_getFileStructure (LSP — Document Symbol)
// ============================================================

interface FileStructureInput {
    uri: string;
    limit?: number;
}

const fileStructureTool: vscode.LanguageModelTool<FileStructureInput> = {
    async invoke(options, _token) {
        const startTime = Date.now();
        const limit = Math.min(Math.max(Math.floor(options.input.limit ?? DEFAULT_FILE_STRUCTURE_SYMBOL_NODES), 1), MAX_FILE_STRUCTURE_SYMBOL_NODES);
        let resultCount = 0;
        let status = "success";
        let errorCode = "";
        let emptyReason = "";
        let responseCharCount = 0;
        let truncated = false;
        try {
            const uri = resolveFileUri(options.input.uri);
            try {
                await vscode.workspace.fs.stat(uri);
            } catch {
                status = "error";
                errorCode = "fileNotFound";
                // Most fileNotFound errors come from the model guessing a path. Return an
                // actionable hint instead of a dead end so it can self-correct via findSymbol.
                const fileNotFoundPayload = {
                    error: "File not found.",
                    hint: "Call lsp_java_findSymbol to obtain the exact workspace path before retrying. Do not guess file paths.",
                };
                responseCharCount = getResponseCharCount(fileNotFoundPayload);
                return toResult(fileNotFoundPayload);
            }
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                "vscode.executeDocumentSymbolProvider", uri,
            );
            if (!symbols || symbols.length === 0) {
                status = "empty";
                // Separate "index not ready yet" from a genuine no-symbol result so the model
                // (and telemetry) can tell a transient state apart from an unrecognized file.
                const indexing = !languageServerApiManager.isFullyReady();
                emptyReason = indexing ? "indexingInProgress" : "documentSymbolProviderEmpty";
                const noSymbolsPayload = indexing
                    ? { error: "Java language server is still indexing. Retry shortly." }
                    : { error: "No symbols found. The file may not be recognized by the Java language server." };
                responseCharCount = getResponseCharCount(noSymbolsPayload);
                return toResult(noSymbolsPayload);
            }
            const counter = { count: 0, truncated: false };
            const result = symbolsToJson(symbols, 0, counter, limit);
            resultCount = counter.count;
            truncated = counter.truncated;
            const file = vscode.workspace.asRelativePath(uri);
            const fileStructurePayload = { file, symbols: result, ...(truncated && { truncated: true }) };
            responseCharCount = getResponseCharCount(fileStructurePayload);
            return toResult(fileStructurePayload);
        } catch (e) {
            status = "error";
            errorCode = errorCode || getToolErrorCode(e);
            throw e;
        } finally {
            sendInfo("", {
                operationName: "lmTool.getFileStructure",
                status,
                ...(errorCode && { errorCode }),
                ...(emptyReason && { emptyReason }),
                truncated: truncated ? "true" : "false",
                limit,
                resultCount,
                responseCharCount,
                durationMs: Date.now() - startTime,
            });
        }
    },
};

interface SymbolNode {
    name: string;
    kind: string;
    startLine: number;
    endLine: number;
    readFileRange: ReadFileRange;
    range: string;
    detail?: string;
    children?: SymbolNode[];
}

function symbolsToJson(symbols: vscode.DocumentSymbol[], depth: number, counter: { count: number; truncated: boolean }, limit: number): SymbolNode[] {
    const result: SymbolNode[] = [];
    for (const s of symbols) {
        if (counter.count >= limit) {
            counter.truncated = true;
            break;
        }
        counter.count++;
        const { startLine, endLine } = toInclusiveLineRange(s.range);
        const node: SymbolNode = {
            name: s.name,
            kind: vscode.SymbolKind[s.kind],
            startLine,
            endLine,
            readFileRange: toReadFileRange(startLine, endLine),
            range: `L${startLine}-${endLine}`,
        };
        if (s.detail) {
            node.detail = s.detail;
        }
        if (s.children?.length && depth < MAX_SYMBOL_DEPTH) {
            node.children = symbolsToJson(s.children, depth + 1, counter, limit);
        }
        result.push(node);
    }
    return result;
}

// ============================================================
// Tool 2: lsp_java_findSymbol (LSP — Workspace Symbol)
// ============================================================

interface FindSymbolInput {
    query: string;
    limit?: number;
}

const findSymbolTool: vscode.LanguageModelTool<FindSymbolInput> = {
    async invoke(options, _token) {
        const startTime = Date.now();
        let resultCount = 0;
        let totalResults = 0;
        const limit = Math.min(Math.max(options.input.limit || 20, 1), 50);
        let status = "success";
        let errorCode = "";
        let emptyReason = "";
        let responseCharCount = 0;
        let retried = false;
        try {
            const rawQuery = (options.input.query ?? "").trim();
            // Reject blank/whitespace-only queries early: an empty query triggers an
            // expensive workspace-wide symbol scan and can return a huge list.
            if (!rawQuery) {
                status = "error";
                errorCode = "emptyQuery";
                const emptyQueryPayload = {
                    error: "Query is empty. Provide a class, interface, method, or field name to search for.",
                };
                responseCharCount = getResponseCharCount(emptyQueryPayload);
                return toResult(emptyQueryPayload);
            }
            let symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
                "vscode.executeWorkspaceSymbolProvider", rawQuery,
            );
            // Server-side fallback: if the verbatim query misses, retry once with a
            // normalized identifier (strip package qualifier, generics, and parameter
            // lists) so the model does not have to chain repeated findSymbol calls itself.
            if (!symbols || symbols.length === 0) {
                const normalized = normalizeSymbolQuery(rawQuery);
                if (normalized && normalized !== rawQuery) {
                    retried = true;
                    symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
                        "vscode.executeWorkspaceSymbolProvider", normalized,
                    );
                }
            }
            if (!symbols || symbols.length === 0) {
                status = "empty";
                // Distinguish a transient "index not ready" state from a real no-match so the
                // model can retry later instead of concluding the symbol does not exist.
                const indexing = !languageServerApiManager.isFullyReady();
                emptyReason = indexing ? "indexingInProgress" : "workspaceSymbolNoMatch";
                const noMatchesPayload = indexing
                    ? { results: [], message: "Java language server is still indexing. Retry shortly or use grep_search as a fallback." }
                    : { results: [], message: "No symbols found." };
                responseCharCount = getResponseCharCount(noMatchesPayload);
                return toResult(noMatchesPayload);
            }
            totalResults = symbols.length;
            const results = symbols.slice(0, limit).map(s => {
                const file = vscode.workspace.asRelativePath(s.location.uri);
                const { startLine, endLine } = toInclusiveLineRange(s.location.range);
                return {
                    name: s.name,
                    kind: vscode.SymbolKind[s.kind],
                    container: s.containerName || undefined,
                    file,
                    startLine,
                    endLine,
                    readFileInput: toReadFileInput(file, startLine, endLine),
                    range: `L${startLine}-${endLine}`,
                };
            });
            resultCount = results.length;
            const findSymbolPayload = { results, total: symbols.length };
            responseCharCount = getResponseCharCount(findSymbolPayload);
            return toResult(findSymbolPayload);
        } catch (e) {
            status = "error";
            errorCode = getToolErrorCode(e);
            throw e;
        } finally {
            sendInfo("", {
                operationName: "lmTool.findSymbol",
                status,
                ...(errorCode && { errorCode }),
                ...(emptyReason && { emptyReason }),
                retried: retried ? "true" : "false",
                limit,
                resultCount,
                totalResults,
                responseCharCount,
                durationMs: Date.now() - startTime,
            });
        }
    },
};

// ============================================================
// Tool 3: lsp_java_getFileImports (jdtls — AST-only, non-blocking)
// ============================================================

interface FileImportsInput {
    uri: string;
}

export const _fileImportsTool: vscode.LanguageModelTool<FileImportsInput> = {
    async invoke(options, _token) {
        sendInfo("", { operationName: "lmTool.getFileImports" });
        const uri = resolveFileUri(options.input.uri);
        const result = await vscode.commands.executeCommand(
            Commands.EXECUTE_WORKSPACE_COMMAND,
            Commands.JAVA_PROJECT_GET_FILE_IMPORTS,
            uri.toString(),
        );
        if (!result) {
            return toResult({ error: "No result from Java language server. It may still be loading." });
        }
        if (Array.isArray(result) && result.length > MAX_IMPORTS) {
            return toResult({ imports: result.slice(0, MAX_IMPORTS), total: result.length, truncated: true });
        }
        return toResult(result);
    },
};

// ============================================================
// Tool 4: lsp_java_getTypeAtPosition (LSP — Hover post-processed)
// ============================================================

interface TypeAtPositionInput {
    uri: string;
    line: number;
    character: number;
}

export const _typeAtPositionTool: vscode.LanguageModelTool<TypeAtPositionInput> = {
    async invoke(options, _token) {
        sendInfo("", { operationName: "lmTool.getTypeAtPosition" });
        const uri = resolveFileUri(options.input.uri);
        const position = new vscode.Position(options.input.line, options.input.character);
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
            "vscode.executeHoverProvider", uri, position,
        );
        return toResult(extractTypeSignature(hovers));
    },
};

/**
 * Extract type signature from jdtls hover result.
 * jdtls returns Markdown with ```java code blocks containing the type info.
 * We extract just the signature, stripping Javadoc to minimize tokens.
 */
function extractTypeSignature(hovers: vscode.Hover[] | undefined): object {
    if (!hovers?.length) {
        return { error: "No type information at this position" };
    }
    for (const hover of hovers) {
        for (const content of hover.contents) {
            if (content instanceof vscode.MarkdownString) {
                const match = content.value.match(/```java\n([\s\S]*?)```/);
                if (match) {
                    const lines = match[1].trim().split("\n").filter(l => {
                        const trimmed = l.trim();
                        if (trimmed.length === 0) {
                            return false;
                        }
                        // Strip Javadoc and block comment lines
                        if (trimmed.startsWith("/**") || trimmed.startsWith("*/") || trimmed.startsWith("* ") || trimmed === "*") {
                            return false;
                        }
                        // Strip single-line comments
                        if (trimmed.startsWith("//")) {
                            return false;
                        }
                        return true;
                    });
                    return { type: lines.join("\n") };
                }
            }
        }
    }
    return { error: "Could not extract type from hover result" };
}

// ============================================================
// Tool 5: lsp_java_getCallHierarchy (LSP — Call Hierarchy)
// ============================================================

interface CallHierarchyInput {
    uri: string;
    line: number;
    character: number;
    direction: "incoming" | "outgoing";
}

export const _callHierarchyTool: vscode.LanguageModelTool<CallHierarchyInput> = {
    async invoke(options, _token) {
        sendInfo("", { operationName: "lmTool.getCallHierarchy" });
        const uri = resolveFileUri(options.input.uri);
        const position = new vscode.Position(options.input.line, options.input.character);

        // Step 1: Prepare call hierarchy item at the given position
        const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
            "vscode.prepareCallHierarchy", uri, position,
        );
        if (!items?.length) {
            return toResult({ error: "No callable symbol at this position" });
        }

        // Step 2: Get incoming or outgoing calls
        const isIncoming = options.input.direction === "incoming";
        const command = isIncoming ? "vscode.provideIncomingCalls" : "vscode.provideOutgoingCalls";
        const calls = await vscode.commands.executeCommand<any[]>(command, items[0]);

        if (!calls || calls.length === 0) {
            return toResult({
                symbol: items[0].name,
                direction: options.input.direction,
                calls: [],
                message: `No ${options.input.direction} calls found for '${items[0].name}'`,
            });
        }

        const truncated = calls.length > MAX_CALL_RESULTS;
        const capped = truncated ? calls.slice(0, MAX_CALL_RESULTS) : calls;
        const results = capped.map((call: any) => {
            const item = isIncoming ? call.from : call.to;
            return {
                name: item.name,
                detail: item.detail || undefined,
                location: `${vscode.workspace.asRelativePath(item.uri)}:${item.range.start.line + 1}`,
            };
        });

        return toResult({
            symbol: items[0].name,
            direction: options.input.direction,
            calls: results,
            ...(truncated && { total: calls.length, truncated: true }),
        });
    },
};

// ============================================================
// Tool 6: lsp_java_getTypeHierarchy (LSP — Type Hierarchy)
// ============================================================

interface TypeHierarchyInput {
    uri: string;
    line: number;
    character: number;
    direction: "supertypes" | "subtypes";
}

export const _typeHierarchyTool: vscode.LanguageModelTool<TypeHierarchyInput> = {
    async invoke(options, _token) {
        sendInfo("", { operationName: "lmTool.getTypeHierarchy" });
        const uri = resolveFileUri(options.input.uri);
        const position = new vscode.Position(options.input.line, options.input.character);

        // Step 1: Prepare type hierarchy item at the given position
        const items = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(
            "vscode.prepareTypeHierarchy", uri, position,
        );
        if (!items?.length) {
            return toResult({ error: "No type at this position" });
        }

        // Step 2: Get supertypes or subtypes
        const isSuper = options.input.direction === "supertypes";
        const command = isSuper ? "vscode.provideSupertypes" : "vscode.provideSubtypes";
        const types = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(command, items[0]);

        if (!types || types.length === 0) {
            return toResult({
                symbol: items[0].name,
                direction: options.input.direction,
                types: [],
                message: `No ${options.input.direction} found for '${items[0].name}'`,
            });
        }

        const truncated = types.length > MAX_TYPE_RESULTS;
        const capped = truncated ? types.slice(0, MAX_TYPE_RESULTS) : types;
        const results = capped.map(t => ({
            name: t.name,
            kind: vscode.SymbolKind[t.kind],
            detail: t.detail || undefined,
            location: `${vscode.workspace.asRelativePath(t.uri)}:${t.range.start.line + 1}`,
        }));

        return toResult({
            symbol: items[0].name,
            direction: options.input.direction,
            types: results,
            ...(truncated && { total: types.length, truncated: true }),
        });
    },
};

// ============================================================
// Registration
// ============================================================

export function registerJavaContextTools(context: vscode.ExtensionContext): void {
    sendInfo("", { operationName: "lmTool.register" });
    context.subscriptions.push(
        vscode.lm.registerTool("lsp_java_getFileStructure", fileStructureTool),
        vscode.lm.registerTool("lsp_java_findSymbol", findSymbolTool),
    );
}
