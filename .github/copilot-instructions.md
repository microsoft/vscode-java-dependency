# Copilot instructions for vscode-java-dependency

## Bug reproduction

- When an issue is assigned to Copilot, or you are asked to reproduce or confirm a reported bug, use the `repro` skill.
- First decide whether the bug needs a UI/E2E test. Use an AutoTest plan (`uitest` skill) for user-facing surfaces (Java Projects tree, context menus, commands, classpath, export jar, view modes). Use a `test/maven-suite` unit test or a `jdtls.ext` test for pure logic, backend, or build/packaging bugs.
- Reproduce with the reporter's project: clone the linked repo as a sibling or recreate the zip/inline sources, then distill it to a **minimal committed fixture**. Do not commit whole user projects or large binaries.
- Author the reproduction so it fails on the current build and passes after the fix, and leave it committed as a regression test (a new `test/e2e-plans/repro-issue-<n>.yaml` is picked up by CI automatically).
- If no reproducible project is provided and the bug is environment-specific, ask for one and label `needs-more-info` — do not fabricate a fix for an unreproduced bug.

## UI and E2E tests

- When asked to add, update, run, or debug UI/E2E coverage, prefer the AutoTest YAML workflow under `test/e2e-plans/`.
- Use the `uitest` skill for UI test work. It should create or update `test/e2e-plans/*.yaml`, validate the plan, build the OSGi bundle and package the extension when needed, run AutoTest, and inspect `test-results/`.
- Do not create legacy VS Code extension tests (`test/maven-suite`, `test/gui`) for UI coverage unless the user explicitly asks for that format.
- Prefer deterministic AutoTest verifiers (`verifyTreeItem`, `verifyFile`, `verifyEditorTab`, `verifyClipboard`) on the decisive assertion step; you do not need a verifier on every step. Use AutoTest screenshots to prove a fix (a red run before, a green run after) — but never as the sole pass/fail authority for the decisive assertion.
