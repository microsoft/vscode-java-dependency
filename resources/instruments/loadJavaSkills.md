---
description: Guidelines for using Java LSP tools when working with Java codebases
---

MANDATORY: For ANY Java code task (bug fixing, code analysis, refactoring):

1. LOAD TOOLS FIRST — Call tool_search_tool_regex with pattern:
   lsp_java_findSymbol|lsp_java_getFileStructure|lsp_java_getCallHierarchy|lsp_java_getTypeHierarchy|lsp_java_getTypeAtPosition|lsp_java_getFileImports

2. ALWAYS prefer lsp_java_* tools over grep_search/read_file for .java files.
   These tools provide compiler-accurate results with ~90% fewer tokens.

3. Read the "java-lsp-tools" skill for detailed per-tool usage guidance.

Do NOT skip step 1. Do NOT use grep_search as a substitute for lsp_java_* tools on .java files.