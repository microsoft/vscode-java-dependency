---
name: java-lsp-tools
description: Compiler-accurate Java code navigation via the Java Language Server. Use lsp_java_findSymbol to locate symbols and lsp_java_getFileStructure to inspect file outlines. Prefer over grep_search for Java symbol navigation.
---

# Java LSP Tools

Two compiler-accurate tools backed by the Java Language Server (jdtls). They return structured JSON with fewer tokens than `grep_search` or `read_file`.

## Tools

### `lsp_java_findSymbol`
Search for Java symbol definitions (classes, methods, fields) by name across the workspace. Supports partial matching.
- Input: `{ query, limit? }` — limit defaults to 20, max 50
- Output: `{ name, kind, location }` per result (~60 tokens)
- **Use instead of** `grep_search` when looking for where a class/method is defined

### `lsp_java_getFileStructure`
Get hierarchical outline of a Java file (classes, methods, fields) with line ranges.
- Input: `{ uri }` — workspace-relative path. Must be a known path from prior tool results or user input — do not guess
- Output: symbol tree with `L start-end` ranges (~100 tokens)
- **Use instead of** `read_file` full scan when you need to understand a file's layout

## When to Use

| Task | Use | Not |
|---|---|---|
| Find class/method/field definition | `lsp_java_findSymbol` | `grep_search` |
| See file outline before reading | `lsp_java_getFileStructure` | `read_file` full file |
| Search non-Java files (xml, gradle) | `grep_search` | lsp tools |
| Search string literals or comments | `grep_search` | lsp tools |

## Typical Workflow

**findSymbol → getFileStructure → read_file (specific lines only)**

## Fallback

- `findSymbol` returns empty → retry with shorter keyword, then fall back to `grep_search`
- Path error → use `findSymbol` to discover correct path first
- Tool error / jdtls not ready → fall back to `grep_search` + `read_file`, don't retry more than once
