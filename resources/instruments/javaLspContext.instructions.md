---
description: Unconditionally loaded for all Java projects. Provides Java LSP tools (lsp_java_*) for compiler-accurate code navigation — significantly faster and more precise than grep_search, search_subagent, or read_file for locating Java symbols, callers, implementations, and types.
applyTo: '*'
---

# Java LSP Tools — Mandatory Initialization

This workspace contains Java code. You have access to 6 compiler-accurate LSP tools that are **faster and more precise** than generic search for Java code navigation. These tools return structured results in ~20-100 tokens vs ~500-3000 tokens from grep_search, with zero false positives.

## Step 1: Load Tools (REQUIRED — do this FIRST)

Before ANY operation, load all 6 tools by calling `tool_search_tool_regex` **twice** (the API returns at most 5 tools per call):

**Call 1** — basic navigation tools:
```
lsp_java_findSymbol|lsp_java_getFileStructure|lsp_java_getFileImports
```

**Call 2** — hierarchy and type tools:
```
lsp_java_getCallHierarchy|lsp_java_getTypeHierarchy|lsp_java_getTypeAtPosition
```

All 6 tools must be returned across the two calls. If any are missing, retry that call once. Do NOT use `grep_search`, `read_file`, `semantic_search`, `search_subagent`, or `runSubagent` on `.java` files until all tools are loaded.

## Step 2: Always Prefer LSP Tools for Java

| Task | ✅ Use | ❌ Not |
|---|---|---|
| Find class/method/field definition | `lsp_java_findSymbol` | `grep_search`, `semantic_search`, `search_subagent` |
| See file outline (methods, fields) | `lsp_java_getFileStructure` | `read_file` full scan |
| Find all callers of a method | `lsp_java_getCallHierarchy("incoming")` | `grep_search`, `search_subagent` |
| Find all implementations | `lsp_java_getTypeHierarchy("subtypes")` | `grep_search`, `search_subagent` |
| Resolve var/lambda/generic type | `lsp_java_getTypeAtPosition` | Guessing from code |
| Check imports | `lsp_java_getFileImports` | `read_file` first lines |
| Explore Java codebase structure | `lsp_java_*` tools above | `search_subagent`, `runSubagent` |

**Keep using `grep_search`** for: non-Java files (xml, yaml, gradle), string literals, comments.

**Self-check**: Before every `.java` operation, ask: "Is there a `lsp_java_*` tool for this?" If yes, use it instead of `grep_search`, `search_subagent`, or `runSubagent`.

## Typical Workflow

**findSymbol → getFileStructure → targeted tool → read_file (specific lines only)**

## Fallback

- `findSymbol` returns empty → retry with shorter keyword, then fall back to `grep_search`
- Path error → use `findSymbol` to discover correct path first
- Tool error / jdtls not ready → fall back to `read_file` + `grep_search`, don't retry more than once

