---
description: Use Java LSP tools for Java type-name lookup and known-file outlines. Method search depends on Java settings; use outlines or text search for members.
applyTo: '**/*.java'
---

For Java navigation, two `lsp_java_*` tools return structured results from language-service providers:

- `lsp_java_findSymbol(query)` — locate types by name or pattern. Source methods require `java.symbols.includeSourceMethodDeclarations`; fields are not searched. Do not change Java settings to make a query work.
- `lsp_java_getFileStructure(uri)` — get a known workspace file's outline (classes, methods, fields) with full declaration ranges.

If these tools are not already available in the current tool list, load them with `tool_search` using a query such as `Java LSP symbol navigation lsp_java`.

Prefer `lsp_java_findSymbol` for type-name lookup. For a method or field with a known containing type, locate that type and inspect its file outline. If the containing type is unknown, use text search. A result's `selectionRange` is a navigation location, not an implementation range; do not read it expecting a complete method or class.

Pass `documentUri` to `lsp_java_getFileStructure` only when `outlineSupported=true`, or use a confirmed workspace file path. Its output includes an absolute `file` path and per-symbol `readFileRange` with 1-based `offset` and line-count `limit`. Adapt those fields to the available reader's schema; Native and CLI readers need not have identical parameters. Select the needed member before reading a large class. If `truncated=true`, an omitted member is not evidence of absence; use targeted text search rather than repeatedly requesting the same capped outline.

When `outlineSupported=false`, preserve `documentUri` and use an authorized reader that supports dependency, virtual, or external source. Do not rewrite it as a workspace path or bypass access boundaries. On `fileNotFound`, confirm the file path; on `permissionDenied` or `fileSystemUnavailable`, address access or connection issues instead of repeating symbol lookup.

Use generic search for string literals, comments, XML, Gradle/Maven files, non-Java files, or broad conceptual exploration. `lsp_java_findSymbol` retries internally only when normalization changes an empty query result. Do not repeat the same search on an empty result: retry once after initialization only if it reports `serverNotFullyReady`; otherwise use generic search. Server readiness describes initialization, not proof of complete results.
