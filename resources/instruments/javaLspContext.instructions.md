---
description: Hint that Java LSP tools (lsp_java_*) are available for code navigation on Java files.
applyTo: '**/*.java'
---

For Java files, six `lsp_java_*` tools are available for symbol-level navigation: `findSymbol`, `getFileStructure`, `getFileImports`, `getTypeAtPosition`, `getCallHierarchy`, `getTypeHierarchy`. Prefer them over `grep_search` or full-file reads when the task is about symbols, callers, or type hierarchies. See the `java-lsp-tools` skill for details and fallback guidance.

