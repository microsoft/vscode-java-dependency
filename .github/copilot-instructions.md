# Copilot instructions for vscode-java-dependency

## UI and E2E tests

- When asked to add, update, run, or debug UI/E2E coverage, prefer the AutoTest YAML workflow under `test/e2e-plans/`.
- Use the `uitest` skill for UI test work. It should create or update `test/e2e-plans/*.yaml`, validate the plan, build the OSGi bundle and package the extension when needed, run AutoTest, and inspect `test-results/`.
- Do not create legacy VS Code extension tests (`test/maven-suite`, `test/gui`) for UI coverage unless the user explicitly asks for that format.
- Prefer deterministic AutoTest verifiers (`verifyTreeItem`, `verifyFile`, `verifyEditorTab`, `verifyClipboard`) over screenshot-only checks.
