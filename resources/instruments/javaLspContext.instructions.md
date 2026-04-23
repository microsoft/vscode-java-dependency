---
description: REQUIRED for Java files. Provides compiler-accurate lsp_java_findSymbol and lsp_java_getFileStructure tools that replace grep_search for Java symbol navigation.
applyTo: '**/*.java'
---

For Java files, two compiler-accurate `lsp_java_*` tools are available and return structured results in ~50 tokens vs ~500+ for grep_search:

- `lsp_java_findSymbol(query)` — find class/method/field definitions by name across the workspace
- `lsp_java_getFileStructure(uri)` — get file outline (classes, methods, fields) with line ranges

These are deferred tools. Load them with `tool_search_tool_regex` using pattern `lsp_java_` before first use.

Prefer these over `grep_search` or full-file `read_file` when navigating Java symbols. Fall back to `grep_search` if a tool returns empty or errors.

