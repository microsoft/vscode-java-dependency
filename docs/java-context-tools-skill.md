# Java Context Tools — Skill Document for LLM

> This document teaches you how to effectively use the Java-specific tools when working on Java projects. Read this BEFORE using any of these tools.

## When to Use These Tools

You have access to 6 Java-specific tools that provide **compiler-accurate** information about Java projects. These tools are faster and more accurate than `grep_search` or `read_file` for understanding Java code structure, types, and relationships.

**Use these tools when:**
- You need to understand a Java file's structure without reading the entire file
- You need to find where a class, interface, or method is defined in the workspace
- You need to know what a Java file imports and which libraries it depends on
- You need to resolve `var`, lambda, or generic types that aren't obvious from source code
- You need to trace call chains or type hierarchies accurately

**Do NOT use these tools when:**
- The question can be answered by reading a single file (use `read_file` instead)
- You're working on non-Java files (pom.xml, build.gradle, yaml, etc.)
- You just need to do a text search (use `grep_search`)

---

## Tool Reference

### `java_getFileStructure`

**Purpose:** Get the structural outline of a Java file — classes, methods, fields with line ranges.

**When to call:**
- FIRST tool to call when you need to understand a Java file
- When you need to find which line a specific method starts at
- When planning modifications to a large file (500+ lines)

**Input:** `{ uri: "<java file URI>" }`

**Output:** Tree of symbols with kinds (Class, Method, Field, etc.) and line ranges.

**Typical output size:** ~100 tokens

**This replaces reading an entire file just to understand its structure.** Use this first, then `read_file` on specific line ranges.

---

### `java_findSymbol`

**Purpose:** Find classes, interfaces, methods by name across the entire workspace.

**When to call:**
- When you know a class name (or partial name) but don't know which file it's in
- When searching for implementations of a pattern (e.g., all `*Controller` classes)
- When `grep_search` returns too many false positives (comments, strings, imports)

**Input:** `{ query: "PaymentGateway" }`

**Output:** Up to 20 matching symbols with name, kind, and file location.

**Typical output size:** ~60 tokens

**This is more precise than grep** — it only returns actual symbol definitions, not mentions in comments or strings.

---

### `java_getFileImports`

**Purpose:** Get all import statements from a Java file, classified by source (jdk/project/external).

**When to call:**
- When you need to understand what types a file uses WITHOUT reading the full source
- When deciding which external libraries a file depends on
- When checking if a file already imports a class you want to use

**Input:** `{ fileUri: "<java file URI>" }`

**Output:** Classified import list with kind and source for regular and static imports.

**Typical output size:** ~80 tokens

**Important:** This tells you WHAT is imported but not HOW it's used. For details about a specific imported class, use `read_file` to read the relevant source or `java_getTypeAtPosition` on its usage.

---

### `java_getTypeAtPosition`

**Purpose:** Get the exact resolved type of any expression at a specific source position.

**When to call:**
- When you see `var` and need to know the actual type
- When you need to know the return type of a chained method call
- When working with generic types and need the resolved type parameters
- When lambda parameters don't have explicit types

**Input:** `{ uri: "<file URI>", line: 42, character: 15 }` (0-based)

**Output:** The resolved type signature at that position.

**Typical output size:** ~20 tokens

**This uses the Java compiler's own type inference** — it's 100% accurate, unlike guessing from source code.

---

### `java_getCallHierarchy`

**Purpose:** Find all callers of a method (incoming) or all methods it calls (outgoing).

**When to call:**
- Before modifying a method's signature — to find all callers that need updating
- When doing impact analysis of a change
- When understanding the flow of a specific feature

**Input:** `{ uri: "<file URI>", line: 45, character: 20, direction: "incoming" | "outgoing" }` (0-based)

**Output:** List of caller/callee methods with file locations.

**Typical output size:** ~80 tokens

**This is more precise than `list_code_usages`** — it only returns actual CALLS, not imports, declarations, or comments.

---

### `java_getTypeHierarchy`

**Purpose:** Find all supertypes or subtypes of a class/interface.

**When to call:**
- When modifying an interface and need to find ALL implementations (including indirect ones)
- When understanding an inheritance chain
- When checking if a class can be used where a specific type is expected

**Input:** `{ uri: "<file URI>", line: 10, character: 14, direction: "supertypes" | "subtypes" }` (0-based)

**Output:** Type hierarchy with symbol kinds and locations.

**Typical output size:** ~60 tokens

**This catches things grep misses** — indirect implementations, anonymous classes, lambda implementations.

---

## Recommended Workflow Patterns

### Pattern 1: "Fix a bug in a Java file"

```
1. java_getFileStructure(file)           → Understand what's in the file (100 tokens)
2. read_file(file, relevant_lines)       → Read the buggy method
3. [If needed] java_getFileImports(file) → Check what types are used (80 tokens)
4. [If needed] java_getTypeAtPosition()  → Resolve ambiguous types (20 tokens)
5. Edit the file
```
Total tool overhead: ~200 tokens (vs ~3000+ tokens if you blindly dump all imports)

### Pattern 2: "Understand a new Java project"

```
1. read_file(pom.xml or build.gradle)    → Check build tool, Java version, deps
2. java_findSymbol("Main")              → Find entry points (60 tokens)
3. java_getFileStructure(main_file)     → Understand main file (100 tokens)
4. java_getFileImports(main_file)       → See what libraries are used (80 tokens)
```
Total tool overhead: ~240 tokens

### Pattern 3: "Refactor a method signature"

```
1. java_getCallHierarchy(method, "incoming")  → Find all callers (80 tokens)
2. For each caller file:
   java_getFileStructure(caller_file)          → Understand caller context (100 tokens)
3. Edit all affected files
```

### Pattern 4: "Find all implementations of an interface"

```
1. java_findSymbol("MyInterface")                     → Locate the interface (60 tokens)
2. java_getTypeHierarchy(interface_pos, "subtypes")    → Find all impls (60 tokens)
3. For key implementations:
   java_getFileStructure(impl_file)                     → See what they override
```

### Pattern 5: "Understand dependency usage in a file"

```
1. java_getFileImports(file)             → See all imports classified (80 tokens)
2. [For unfamiliar external types]:
   java_getTypeAtPosition() on usage     → See the resolved type/method signature
3. [If needed] read_file(pom.xml)        → Check dependency coordinates
```

---

## Anti-Patterns (What NOT to Do)

### ❌ Don't call java_getTypeAtPosition on obvious types

```java
String name = "hello";     // Obviously String — don't call the tool
var result = service.process(input);  // Not obvious — DO call the tool
```

### ❌ Don't use these tools for JDK standard library classes

You already know `java.util.List`, `java.lang.String`, `java.io.File`. Don't waste a tool call on them.

### ❌ Don't call java_getFileStructure on small files

If a file is < 100 lines, just use `read_file` directly. File structure is most valuable for large files.

### ❌ Don't call java_getCallHierarchy without reading the method first

Understand what the method does before tracing its callers.

---

## Fallback Strategy

If a Java tool returns an error or empty result:
1. **jdtls not ready:** The Java language server may still be loading. Wait a moment and retry once.
2. **File not in project:** The file may not be part of a recognized Java project. Fall back to `read_file` + `grep_search`.
3. **Build errors (L1/L2):** If the project has unresolved build configuration errors, imports tool may return incomplete source classification. Structure tools should still work.
4. **Compilation errors (L3):** Most tools work fine. Type resolution near the error location may be imprecise.

**For dependency/project info not covered by these tools:**
- Read `pom.xml` or `build.gradle` directly with `read_file`
- Use `grep_search` to find dependency declarations
- Use `java_getFileImports` to see what external libraries a file uses

**General rule:** If a Java-specific tool fails, fall back to the universal tools (`read_file`, `grep_search`, `list_code_usages`). Don't retry more than once.
