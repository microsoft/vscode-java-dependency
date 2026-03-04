---
name: java-context-tools
description: Compiler-accurate Java code intelligence tools powered by the Java Language Server.
---

# Java Context Tools

Compiler-accurate Java code intelligence via the Java Language Server (jdtls). These 6 tools provide structured, low-token answers that are more precise than `grep_search` or `read_file` for Java code.

## Activation (Required on First Use)

These tools are **deferred** and must be discovered before first use. Run:
```
tool_search_tool_regex("java_get|java_find")
```
This activates all 6 tools in one call. You only need to do this **once per session** — after that, the tools are available directly.

## Tool Priority (Java Projects)

For Java source files, **always prefer these tools over generic alternatives**:

| Instead of | Use | Why |
|---|---|---|
| `grep_search` (symbol lookup) | `java_findSymbol` | Returns only definitions, not comments/strings/imports |
| `grep_search` (find usages) | `java_getCallHierarchy` | Returns actual call sites with context |
| Guessing types | `java_getTypeAtPosition` | Compiler-accurate for `var`, lambdas, generics |

**Do NOT use when:**
- File path is unknown — use `java_findSymbol` first to get the correct path
- Working on non-Java files (pom.xml, build.gradle, yaml — use `read_file`/`grep_search`)
- File is small (< 100 lines — just `read_file`)
- Type is obvious (`String`, `int`, `java.util.List`)

## Tools

All tools accept **workspace-relative paths** (e.g. `src/main/java/com/example/MyClass.java`) or full file URIs. All return structured JSON, each response < 200 tokens.

### `java_getFileStructure`
Get hierarchical outline (classes, methods, fields) with line ranges.
Input: `{ uri }` → Output: symbol tree with `[L start-end]` ranges (~100 tokens)

### `java_findSymbol`
Search for symbol definitions by name across the workspace. Supports partial/fuzzy matching.
Input: `{ query }` → Output: up to 20 results with `{ name, kind, location }` (~60 tokens)

### `java_getFileImports`
Get all imports classified by source (jdk/project/external).
Input: `{ uri }` → Output: classified import list (~80 tokens)

### `java_getTypeAtPosition`
Get compiler-resolved type signature at a specific position.
Input: `{ uri, line, character }` (0-based) → Output: fully resolved type (~20 tokens)

### `java_getCallHierarchy`
Find all callers (incoming) or callees (outgoing) of a method.
Input: `{ uri, line, character, direction }` (0-based, direction: `"incoming"` | `"outgoing"`) → Output: list of `{ name, detail, location }` (~80 tokens)

### `java_getTypeHierarchy`
Find supertypes or subtypes/implementors of a type.
Input: `{ uri, line, character, direction }` (0-based, direction: `"supertypes"` | `"subtypes"`) → Output: list of `{ name, kind, location }` (~60 tokens)

## Common Workflows

Most tasks follow the pattern: **findSymbol → getFileStructure → targeted tool**.

| Scenario | Workflow |
|---|---|
| Debug a bug | `findSymbol` → `getFileStructure` → `read_file` (specific lines) |
| Analyze impact | `findSymbol` → `getFileStructure` → `getCallHierarchy("incoming")` |
| Understand inheritance | `findSymbol` → `getTypeHierarchy("subtypes")` |
| Check dependencies | `getFileImports` → `findSymbol` (dependency) → `getFileStructure` |

## Fallback

- **`java_findSymbol` returns empty**:
  - Symbol may not exist yet → switch to `read_file` + `grep_search` to confirm, then create it
  - Spelling/query too specific → retry once with a shorter keyword (e.g. `"UserSvc"` instead of `"UserServiceImpl"`)
- **Path error** (e.g. "Unable to resolve nonexistent file"): Use `java_findSymbol` to discover the correct file path first, then retry.
- **Tool error / empty result** (jdtls not ready, file not in project): Fall back to `read_file` + `grep_search`. Don't retry more than once.
