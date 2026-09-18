---
description: Java type lookup and known-file outlines.
applyTo: '**/*.java'
---

Prefer Java LSP tools for type-name lookup and known-file outlines. Use text search for members with unknown containing types or non-symbol content. Do not change Java settings to make a lookup work.

Load the `java-lsp-tools` skill as needed for tool discovery, settings, URI/range handoff, reader adaptation and fallback rules.
