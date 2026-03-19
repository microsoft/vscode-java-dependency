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

import * as vscode from "vscode";
import { Commands } from "../../commands";
import { sendInfo } from "vscode-extension-telemetry-wrapper";

// Hard caps to keep tool responses within the < 200 token budget.
const MAX_SYMBOL_DEPTH = 3;
const MAX_SYMBOL_NODES = 80;
const MAX_CALL_RESULTS = 50;
const MAX_TYPE_RESULTS = 50;
const MAX_IMPORTS = 50;

function toResult(data: unknown): vscode.LanguageModelToolResult {
    const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(text),
    ]);
}

/**
 * Resolve a file path to a vscode.Uri.
 * Accepts:
 *   - Full file URI:  "file:///home/user/project/src/Main.java"
 *   - Relative path:  "src/main/java/Main.java"
 *   - Absolute path:  "/home/user/project/src/Main.java" or "C:\\Users\\...\\Main.java"
 *
 * Relative paths are resolved against the first workspace folder.
 * The resolved URI must use the file: scheme and fall under a workspace folder.
 */
function resolveFileUri(input: string): vscode.Uri {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        throw new Error("No workspace folder is open.");
    }

    let uri: vscode.Uri;

    // Full URI — only allow the file: scheme
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input) || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(input)) {
        uri = vscode.Uri.parse(input);
        if (uri.scheme !== "file") {
            throw new Error(`Unsupported URI scheme "${uri.scheme}". Only file: URIs are allowed.`);
        }
    } else if (input.startsWith("/") || /^[a-zA-Z]:[/\\]/.test(input)) {
        // Absolute path (Unix or Windows)
        uri = vscode.Uri.file(input);
    } else {
        // Relative path — resolve against first workspace folder
        uri = vscode.Uri.joinPath(folders[0].uri, input);
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
}

const fileStructureTool: vscode.LanguageModelTool<FileStructureInput> = {
    async invoke(options, _token) {
        sendInfo("", { operationName: "lmTool.getFileStructure" });
        const uri = resolveFileUri(options.input.uri);
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            "vscode.executeDocumentSymbolProvider", uri,
        );
        if (!symbols || symbols.length === 0) {
            return toResult({ error: "No symbols found. The file may not be recognized by the Java language server." });
        }
        const counter = { count: 0 };
        const result = symbolsToJson(symbols, 0, counter);
        const truncated = counter.count >= MAX_SYMBOL_NODES;
        return toResult({ symbols: result, ...(truncated && { truncated: true }) });
    },
};

interface SymbolNode {
    name: string;
    kind: string;
    range: string;
    detail?: string;
    children?: SymbolNode[];
}

function symbolsToJson(symbols: vscode.DocumentSymbol[], depth: number, counter: { count: number }): SymbolNode[] {
    const result: SymbolNode[] = [];
    for (const s of symbols) {
        if (counter.count >= MAX_SYMBOL_NODES) {
            break;
        }
        counter.count++;
        const node: SymbolNode = {
            name: s.name,
            kind: vscode.SymbolKind[s.kind],
            range: `L${s.range.start.line + 1}-${s.range.end.line + 1}`,
        };
        if (s.detail) {
            node.detail = s.detail;
        }
        if (s.children?.length && depth < MAX_SYMBOL_DEPTH) {
            node.children = symbolsToJson(s.children, depth + 1, counter);
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
        sendInfo("", { operationName: "lmTool.findSymbol" });
        const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
            "vscode.executeWorkspaceSymbolProvider", options.input.query,
        );
        if (!symbols || symbols.length === 0) {
            return toResult({ results: [], message: `No symbols matching '${options.input.query}' found.` });
        }
        const limit = Math.min(Math.max(options.input.limit || 20, 1), 50);
        const results = symbols.slice(0, limit).map(s => ({
            name: s.name,
            kind: vscode.SymbolKind[s.kind],
            location: `${vscode.workspace.asRelativePath(s.location.uri)}:${s.location.range.start.line + 1}`,
        }));
        return toResult({ results, total: symbols.length });
    },
};

// ============================================================
// Tool 3: lsp_java_getFileImports (jdtls — AST-only, non-blocking)
// ============================================================

interface FileImportsInput {
    uri: string;
}

const fileImportsTool: vscode.LanguageModelTool<FileImportsInput> = {
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

const typeAtPositionTool: vscode.LanguageModelTool<TypeAtPositionInput> = {
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

const callHierarchyTool: vscode.LanguageModelTool<CallHierarchyInput> = {
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

const typeHierarchyTool: vscode.LanguageModelTool<TypeHierarchyInput> = {
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
        vscode.lm.registerTool("lsp_java_getFileImports", fileImportsTool),
        vscode.lm.registerTool("lsp_java_getTypeAtPosition", typeAtPositionTool),
        vscode.lm.registerTool("lsp_java_getCallHierarchy", callHierarchyTool),
        vscode.lm.registerTool("lsp_java_getTypeHierarchy", typeHierarchyTool),
    );
}
