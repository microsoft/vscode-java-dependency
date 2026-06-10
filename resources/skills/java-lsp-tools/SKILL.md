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
- Output: `{ results: [{ name, kind, container?, file, startLine, endLine, location, range, outlineInput }], total }`; `range` is `L start-end`, and `outlineInput` can be passed to `lsp_java_getFileStructure`
- **Use instead of** `grep_search`, `file_search`, `semantic_search`, or `search_subagent` when looking for where a Java class/method/field is defined by identifier
- Do not repeat with the same or similar query after relevant results are returned

### `lsp_java_getFileStructure`
Get hierarchical outline of a Java file (classes, methods, fields) with line ranges.
- Input: `{ uri }` — workspace-relative path. Prefer `outlineInput` or `file` from `lsp_java_findSymbol`. Must be a known path from prior tool results or user input — do not guess
- Output: symbol tree with `L start-end` ranges (~100 tokens)
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

**findSymbol → getFileStructure → read_file (specific lines only)**

If `findSymbol` returns relevant symbols, use `read_file` on the returned `file`/`range`, or call `getFileStructure` with `outlineInput` when broader file context is needed. Do not call `findSymbol` again with the same or similar identifier unless the returned symbols are irrelevant.

## Fallback

- `findSymbol` returns empty → it already retried internally with a normalized identifier, so do not re-issue the same search. If the result says indexing is in progress, retry once after a short pause; otherwise fall back to `grep_search`
- Path error (`fileNotFound`) → use `findSymbol` to discover the correct path first; do not guess paths
- Tool error / jdtls not ready → fall back to `grep_search` + `read_file`, don't retry more than once
