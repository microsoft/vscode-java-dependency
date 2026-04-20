---
name: java-lsp-tools
description: Java code navigation via the language server. Use on .java files for symbol, caller, subtype, and type-resolution queries. Returns structured JSON and is usually smaller than grep_search output for symbol-level questions. Falls back to grep_search/read_file when unavailable.
---

# Java LSP Tools

Six tools backed by the Java Language Server (jdtls). All accept workspace-relative paths or `file://` URIs, and return structured JSON.

## Tools

- `lsp_java_findSymbol(query, limit?)` — workspace symbol search by name. Indexed lookup, so overloads and partial matches may appear. Returns up to 50 results as `{ name, kind, location }`.
- `lsp_java_getFileStructure(uri)` — document outline with class/method/field line ranges, capped at 80 nodes.
- `lsp_java_getFileImports(uri)` — import list, capped at 50.
- `lsp_java_getTypeAtPosition(uri, line, character)` — hover-derived type signature at a 0-based position.
- `lsp_java_getCallHierarchy(uri, line, character, "incoming"|"outgoing")` — callers or callees, capped at 50.
- `lsp_java_getTypeHierarchy(uri, line, character, "supertypes"|"subtypes")` — parents or implementors, capped at 50.

## When to prefer each

| Task on Java code | Tool |
|---|---|
| Find a class, method, or field by name | `findSymbol` |
| See what's in a Java file before reading it | `getFileStructure` |
| Check what a file imports | `getFileImports` |
| Resolve `var` / lambda / generic type | `getTypeAtPosition` |
| Find all callers of a method | `getCallHierarchy("incoming")` |
| Find all subclasses of a type | `getTypeHierarchy("subtypes")` |

For non-Java files, string literal search, or comment search, use `grep_search` / `read_file` as usual — these tools only operate on Java source.

## Fallback

If a tool returns an error, empty result, or the language server isn't ready, fall back to `grep_search` or `read_file`. Don't retry more than once.

## Notes

- `findSymbol` uses the workspace symbol index, not the compiler — overloaded names and partial matches may appear; verify with `getFileStructure` or `getTypeAtPosition` when precision matters.
- Results are capped (50–80 items). When truncated, refine the query or narrow by file.
