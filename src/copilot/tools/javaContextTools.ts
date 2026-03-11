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
 *
 * Note: The LanguageModelTool API is not yet in @types/vscode 1.83.1,
 * so we use (vscode as any) casts following the same pattern as vscode-java-debug.
 */

import * as vscode from "vscode";
import { Commands } from "../../commands";

// ────────────────────────────────────────────────────────────
// Type shims for vscode.lm LanguageModelTool API
// (not available in @types/vscode 1.83.1)
// ────────────────────────────────────────────────────────────

interface LanguageModelTool<T = any> {
    invoke(options: { input: T }, token: vscode.CancellationToken): Promise<any>;
}

// Access the lm namespace via any-cast
const lmApi = (vscode as any).lm;

function toResult(data: unknown): any {
    const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    return new (vscode as any).LanguageModelToolResult([
        new (vscode as any).LanguageModelTextPart(text),
    ]);
}

/**
 * Resolve a file path to a vscode.Uri.
 * Accepts:
 *   - Full URI:      "file:///home/user/project/src/Main.java"
 *   - Relative path: "src/main/java/Main.java"
 *   - Absolute path: "/home/user/project/src/Main.java" or "C:\\Users\\...\\Main.java"
 *
 * Relative paths are resolved against the first workspace folder.
 */
function resolveFileUri(input: string): vscode.Uri {
    // Already a full URI (has scheme like file://, untitled:, etc.)
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input) || input.startsWith("untitled:")) {
        return vscode.Uri.parse(input);
    }
    // Absolute path (Unix or Windows)
    if (input.startsWith("/") || /^[a-zA-Z]:[/\\]/.test(input)) {
        return vscode.Uri.file(input);
    }
    // Relative path — resolve against workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
        return vscode.Uri.joinPath(workspaceFolder.uri, input);
    }
    // Fallback: treat as file path
    return vscode.Uri.file(input);
}

// ============================================================
// Tool 1: lsp_java_getFileStructure (LSP — Document Symbol)
// ============================================================

interface FileStructureInput {
    uri: string;
}

const fileStructureTool: LanguageModelTool<FileStructureInput> = {
    async invoke(options, _token) {
        const uri = resolveFileUri(options.input.uri);
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            "vscode.executeDocumentSymbolProvider", uri,
        );
        if (!symbols || symbols.length === 0) {
            return toResult({ error: "No symbols found. The file may not be recognized by the Java language server." });
        }
        return toResult(formatSymbols(symbols, 0));
    },
};

function formatSymbols(symbols: vscode.DocumentSymbol[], indent: number): string {
    return symbols.map(s => {
        const prefix = "  ".repeat(indent);
        const kind = vscode.SymbolKind[s.kind];
        const range = `[L${s.range.start.line + 1}-${s.range.end.line + 1}]`;
        const detail = s.detail ? ` ${s.detail}` : "";
        let line = `${prefix}${kind}: ${s.name}${detail} ${range}`;
        if (s.children?.length) {
            line += "\n" + formatSymbols(s.children, indent + 1);
        }
        return line;
    }).join("\n");
}

// ============================================================
// Tool 2: lsp_java_findSymbol (LSP — Workspace Symbol)
// ============================================================

interface FindSymbolInput {
    query: string;
    limit?: number;
}

const findSymbolTool: LanguageModelTool<FindSymbolInput> = {
    async invoke(options, _token) {
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

const fileImportsTool: LanguageModelTool<FileImportsInput> = {
    async invoke(options, _token) {
        const uri = resolveFileUri(options.input.uri);
        const result = await vscode.commands.executeCommand(
            Commands.EXECUTE_WORKSPACE_COMMAND,
            Commands.JAVA_PROJECT_GET_FILE_IMPORTS,
            uri.toString(),
        );
        if (!result) {
            return toResult({ error: "No result from Java language server. It may still be loading." });
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

const typeAtPositionTool: LanguageModelTool<TypeAtPositionInput> = {
    async invoke(options, _token) {
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
                    const lines = match[1].trim().split("\n").filter(l => l.trim().length > 0);
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

const callHierarchyTool: LanguageModelTool<CallHierarchyInput> = {
    async invoke(options, _token) {
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

        const results = calls.map((call: any) => {
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

const typeHierarchyTool: LanguageModelTool<TypeHierarchyInput> = {
    async invoke(options, _token) {
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

        const results = types.map(t => ({
            name: t.name,
            kind: vscode.SymbolKind[t.kind],
            detail: t.detail || undefined,
            location: `${vscode.workspace.asRelativePath(t.uri)}:${t.range.start.line + 1}`,
        }));

        return toResult({
            symbol: items[0].name,
            direction: options.input.direction,
            types: results,
        });
    },
};

// ============================================================
// Registration
// ============================================================

export function registerJavaContextTools(context: vscode.ExtensionContext): void {
    // Guard: Language Model API may not be available in older VS Code versions
    if (!lmApi || typeof lmApi.registerTool !== "function") {
        return;
    }

    context.subscriptions.push(
        lmApi.registerTool("lsp_java_getFileStructure", fileStructureTool),
        lmApi.registerTool("lsp_java_findSymbol", findSymbolTool),
        lmApi.registerTool("lsp_java_getFileImports", fileImportsTool),
        lmApi.registerTool("lsp_java_getTypeAtPosition", typeAtPositionTool),
        lmApi.registerTool("lsp_java_getCallHierarchy", callHierarchyTool),
        lmApi.registerTool("lsp_java_getTypeHierarchy", typeHierarchyTool),
    );
}
