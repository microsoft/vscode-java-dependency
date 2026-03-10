---
name: java-context-tools
description: Compiler-accurate Java code intelligence tools powered by the Java Language Server. ALWAYS load this skill when the workspace contains Java, Maven (pom.xml), or Gradle (build.gradle) projects. Use these tools to find symbol definitions, get type/call hierarchies, resolve types, inspect file outlines, and check imports in Java source files. Prefer over grep_search or read_file for any Java code navigation, understanding, debugging, or refactoring task.
---

# Java Context Tools

Compiler-accurate Java code intelligence via the Java Language Server (jdtls). These 6 tools provide structured, low-token answers that are more precise than `grep_search` or `read_file` for Java code.

## Activation

These tools are **deferred** and must be discovered before first use. Activate all 6 tools at once with `tool_search_tool_regex` using pattern:

`java_findSymbol|java_getFileStructure|java_getCallHierarchy|java_getTypeHierarchy|java_getTypeAtPosition|java_getFileImports`

You only need to do this **once per session**.

## When to Replace grep_search

For Java source files, **always prefer these tools over generic alternatives**:

| You're doing... | Use instead | Why |
|---|---|---|
| Find where a class/method is defined | `java_findSymbol` | ~60 tokens vs ~500 for grep (no comment/import noise) |
| Find all callers of a method | `java_getCallHierarchy("incoming")` | ~80 tokens vs ~3000 for grep (precise call sites only) |
| Find all implementations of an interface | `java_getTypeHierarchy("subtypes")` | ~60 tokens vs ~1000 for grep |
| Check a `var`/lambda/generic type | `java_getTypeAtPosition` | ~20 tokens vs guessing wrong |
| Search in non-Java files (xml, yaml, gradle) | Keep using `grep_search` | java_* tools only work on Java source |
| Search for string literals or comments | Keep using `grep_search` | java_* tools return symbol definitions only |

**Rule of thumb**: If you're searching for a Java symbol name in `.java` files, there is almost always a `java_*` tool that returns more precise results with fewer tokens than `grep_search`.

## Anti-patterns (Avoid these)

❌ **Don't**: Use `grep_search("decodeLbs")` to find who calls `decodeLbs()`
   - Returns 8+ matches including declaration, comments, imports → ~3000 output tokens

✅ **Do**: Use `java_getCallHierarchy(uri, line, char, "incoming")`
   - Returns only actual call sites → ~80 output tokens

❌ **Don't**: Use `grep_search("class.*extends BaseDecoder")` to find subclasses
✅ **Do**: Use `java_getTypeHierarchy(uri, line, char, "subtypes")`

❌ **Don't**: Read entire 1000+ line file to understand its structure
✅ **Do**: Use `java_getFileStructure(uri)` first, then `read_file` on specific line ranges

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

| Scenario | Workflow | Trigger |
|---|---|---|
| Debug a bug | `findSymbol` → `getFileStructure` → `read_file` (buggy method) → **`getCallHierarchy("incoming")`** → `read_file` (caller context) | When you found the buggy method and need to know ALL callers |
| Analyze impact | `findSymbol` → `getFileStructure` → `getCallHierarchy("incoming")` | Before editing a method, check who depends on it |
| Understand inheritance | `findSymbol` → `getTypeHierarchy("subtypes")` | When you see a base class and need all implementations |
| Check dependencies | `getFileImports` → `findSymbol` (dependency) → `getFileStructure` | When understanding external library usage |
| Resolve type ambiguity | `getFileStructure` → `getTypeAtPosition` | When you see `var`, generics, or lambda and need exact type |

## Fallback

- **`java_findSymbol` returns empty**:
  - Symbol may not exist yet → switch to `read_file` + `grep_search` to confirm, then create it
  - Spelling/query too specific → retry once with a shorter keyword (e.g. `"UserSvc"` instead of `"UserServiceImpl"`)
- **Path error** (e.g. "Unable to resolve nonexistent file"): Use `java_findSymbol` to discover the correct file path first, then retry.
- **Tool error / empty result** (jdtls not ready, file not in project): Fall back to `read_file` + `grep_search`. Don't retry more than once.
