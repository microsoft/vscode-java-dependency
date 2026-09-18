---
name: java-lsp-tools
description: Java type-name lookup and known-file outlines via the Java Language Server. Method search depends on Java settings; use outlines or text search for members.
---

# Java LSP Tools

Two navigation tools backed by language-service providers, including the Java Language Server (jdtls). Availability and results depend on imported projects, provider scope and Java settings; they do not certify complete coverage.

## Tools

### `lsp_java_findSymbol`
Locate Java types (classes, interfaces, enums, records) by name or pattern.
- Input: `{ query, limit? }` — integer limit defaults to 20, max 50; caps output only, not provider search work.
- Source methods are searched only when `java.symbols.includeSourceMethodDeclarations` is enabled (off by default). Fields are not searched. Do not change user settings to make a query work.
- Output: `{ results: [{ name, kind, container?, documentUri, file?, outlineSupported, unsupportedReason?, selectionRange: { startLine, endLine } }], total, truncated? }`.
- `selectionRange` contains 1-based inclusive navigation lines, usually only the name. It is **not** a full declaration or implementation read range.
- `documentUri` preserves the provider's exact URI. `file` is an absolute path, present only for supported `file:` workspace documents. `outlineSupported` means the location is eligible for the outline tool, not that the file exists or is readable.
- Prefer this tool for type-name lookup. For a member, inspect the known containing type's file outline; if the type is unknown, use text search.

### `lsp_java_getFileStructure`
Get hierarchical outline of a Java file (classes, methods, fields) with line ranges.
- Input: `{ uri, limit? }` — prefer the exact `documentUri` from a result with `outlineSupported=true`. Confirmed absolute or workspace-relative file paths also work. Do not guess paths. Integer limit defaults to 20, max 60, including child nodes.
- Output: `{ documentUri, file, symbols: [{ name, kind, startLine, endLine, readFileRange, range, detail?, children? }], truncated? }`. `file` is absolute. `readFileRange` contains a 1-based `offset` and line-count `limit` covering the provider's full declaration range.
- For a reader accepting `{ filePath, offset, limit }`, use `filePath=file` with the selected symbol's `readFileRange`. Adapt to other reader schemas; Native and CLI parameters are not necessarily identical.
- Select a member before reading a large class. `truncated=true` means count or depth limits omitted symbols; it does not mean the requested member is absent. Use targeted text search when the capped outline omits it.
- **Use before** `read_file` when you need to choose a precise line range in a known Java file

## When to Use

| Task | Use | Not |
|---|---|---|
| Find a type by name | `lsp_java_findSymbol` | Full-file reads |
| Find a member of a known type | Locate type, then `lsp_java_getFileStructure` | Blind member-name workspace search |
| Find a member with unknown containing type | Text search | Assuming method/field search is supported |
| See known Java file outline before reading | `lsp_java_getFileStructure` | `read_file` full file |
| Search non-Java files (xml, gradle) | `grep_search` | lsp tools |
| Search string literals or comments | `grep_search` | lsp tools |
| Explore broad concepts without identifiers | `semantic_search` or `search_subagent` | lsp tools |

## Typical Workflow

**lsp_java_findSymbol → lsp_java_getFileStructure → read_file (specific lines only)**

If `lsp_java_findSymbol` returns a relevant result with `outlineSupported=true` and implementation is needed, pass `documentUri` to `lsp_java_getFileStructure`. Select the appropriate member's full range, then read it. Do not use the workspace symbol's `selectionRange` as a substitute for a full implementation.

## Fallback

- Empty result: normalization is retried internally only when it changes the query. Retry once after initialization if `reason=serverNotFullyReady`; otherwise use text search. Initialization readiness is not index-completeness evidence.
- `outlineSupported=false`: use an authorized document reader supporting `documentUri`. Dependency, virtual and outside-workspace documents are not supported by this outline tool; do not rewrite their URIs as workspace paths.
- `fileNotFound`: confirm the file via type lookup or file search; do not guess.
- `permissionDenied` / `fileSystemUnavailable`: check permissions or the file system connection; symbol search does not repair these failures.
- `ambiguousWorkspacePath`: pass `documentUri` instead of a duplicated workspace-folder display name.
- Other tool errors: fall back to text search and an appropriate reader; do not repeatedly retry.
