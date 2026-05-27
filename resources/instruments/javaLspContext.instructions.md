---
description: Use Java LSP tools for precise Java symbol navigation. Prefer lsp_java_findSymbol and lsp_java_getFileStructure over generic search only when locating Java classes, methods, fields, or file outlines.
applyTo: '**/*.java'
---

For Java symbol navigation, two compiler-accurate `lsp_java_*` tools are available and return structured results with smaller, easier-to-interpret payloads than generic search:

- `lsp_java_findSymbol(query)` — find class/method/field definitions by name across the workspace
- `lsp_java_getFileStructure(uri)` — get file outline (classes, methods, fields) with line ranges

If these tools are not already available in the current tool list, load them with `tool_search` using a query such as `Java LSP symbol navigation lsp_java`.

Use `lsp_java_findSymbol` before `grep_search`, `search_subagent`, `semantic_search`, or `file_search` only when the task is to locate Java symbols by name or partial identifier. If it returns relevant symbols, do not call it again with the same or similar query; next use `lsp_java_getFileStructure` for the returned file or `read_file` on the smallest useful line range.

Use `lsp_java_getFileStructure` only with a path confirmed by the user or a previous tool result. Do not guess paths. Use generic search for string literals, comments, XML, Gradle/Maven files, non-Java files, or broad conceptual exploration. If `findSymbol` returns no matches, retry at most once with a shorter, materially different identifier before falling back to generic search.
