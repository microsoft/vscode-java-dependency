---
name: java-lsp-tools
description: Compiler-accurate Java symbol navigation via the Java Language Server. Use lsp_java_findSymbol for Java identifiers and lsp_java_getFileStructure for known Java files; prefer them over generic search only for symbol/file-outline navigation.
---

# Java LSP Tools

Two compiler-accurate tools backed by the Java Language Server (jdtls). They return structured JSON that is easier to interpret than generic search results for Java symbol navigation.

## Tools

### `lsp_java_findSymbol`
Search for Java symbol definitions (classes, methods, fields) by name across the workspace. Supports partial matching.
- Input: `{ query, limit? }` — limit defaults to 20, max 50
- Output: `{ results: [{ name, kind, container?, file, startLine, endLine, readFileInput, range }], total }`; `readFileInput` is `{ filePath, offset, limit }` for `read_file`, and `file` can be passed to `lsp_java_getFileStructure`
- **Use instead of** `grep_search`, `file_search`, `semantic_search`, or `search_subagent` when looking for where a Java class/method/field is defined by identifier
- When source is needed for a returned symbol, use its `readFileInput` directly

### `lsp_java_getFileStructure`
Get hierarchical outline of a Java file (classes, methods, fields) with line ranges.
- Input: `{ uri, limit? }` — workspace-relative path plus max outline items. Prefer `file` from `lsp_java_findSymbol`; limit defaults to 20, max 60. Must be a known path from prior tool results or user input — do not guess
- Output: `{ file, symbols: [{ name, kind, startLine, endLine, readFileRange, range, detail?, children? }], truncated? }`; call `read_file` with `filePath=file` and the selected symbol's `readFileRange`
- **Use before** `read_file` when you need to choose a precise line range in a known Java file

## When to Use

| Task | Use | Not |
|---|---|---|
| Find class/method/field definition | `lsp_java_findSymbol` | `grep_search` |
| See known Java file outline before reading | `lsp_java_getFileStructure` | `read_file` full file |
| Search non-Java files (xml, gradle) | `grep_search` | lsp tools |
| Search string literals or comments | `grep_search` | lsp tools |
| Explore broad concepts without identifiers | `semantic_search` or `search_subagent` | lsp tools |

## Typical Workflow

**lsp_java_findSymbol → lsp_java_getFileStructure → read_file (specific lines only)**

If `lsp_java_findSymbol` returns relevant symbols and source is needed, call `read_file` with the returned `readFileInput`, or call `lsp_java_getFileStructure` with the returned `file` when broader file context is needed.

## Fallback

- `findSymbol` returns empty → it already retried internally with a normalized identifier, so do not re-issue the same search. If the result says indexing is in progress, retry once after a short pause; otherwise fall back to `grep_search`
- Path error (`fileNotFound`) → use `findSymbol` to discover the correct path first; do not guess paths
- Tool error / jdtls not ready → fall back to `grep_search` + `read_file`, don't retry more than once
