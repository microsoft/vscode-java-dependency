---
applyTo: "test/e2e-plans/**/*.yaml"
description: "Authoring rules for vscode-java-dependency (Project Manager for Java) AutoTest UI/E2E YAML test plans"
---

# AutoTest UI/E2E test plan instructions

Test plans under `test/e2e-plans/` are executable YAML files consumed by `@vscjava/vscode-autotest`. They should describe stable user scenarios for the Java Projects explorer, not raw implementation details.

## Setup rules

- Use `setup.extension: "vscjava.vscode-java-pack"` plus `setup.vscodeVersion: "stable"` for most scenarios. Installing the Extension Pack for Java pulls in every Java extension the Java Projects view relies on, so there is no need to install `redhat.java` separately.
- Install the extension under test from a local VSIX at runtime with `--vsix vscode-java-dependency.vsix` — do not rely on a marketplace copy of `vscjava.vscode-java-dependency`.
- Use existing in-repo fixtures as the workspace: `../maven` (a `maven-archetype-quickstart` project: `my-app` / `com.mycompany.app` / `App.java`) or `../invisible` (an unmanaged-folder project for referenced-library scenarios). Paths are relative to the test plan file. Do not add large binary fixtures.
- Referenced-library / classpath commands (`java.project.addLibraries`, `java.project.removeLibrary`, `java.project.addLibraryFolders`, `java.project.refreshLibraries`) only apply to invisible projects — use `../invisible`, not `../maven`, for those.
- Disable noisy startup surfaces with settings when relevant, for example `workbench.startupEditor: "none"` and `java.configuration.checkProjectSettingsExclusions: false`.

## Action rules

- Prefer stable command IDs via `executeVSCodeCommand` (for example `javaProjectExplorer.focus`, `java.view.package.revealInProjectExplorer`, `workbench.actions.treeView.javaProjectExplorer.collapseAll`) before UI locators. Command IDs are locale-independent.
- Drive the tree with `expandTreeItem <name>` and title-bar buttons with `clickViewTitleAction "Java Projects" "<action>"`. The action resolver only matches the exact `expandTreeItem <name>` form; free-form phrasing silently falls back to the command palette and no-ops.
- Free up sidebar space before asserting tree rows: `executeVSCodeCommand workbench.action.closeAuxiliaryBar`, `collapseSidebarSection OUTLINE`, `collapseSidebarSection TIMELINE`, and `collapseWorkspaceRoot`.
- Use `insertLineInFile` for Java edits that the language server must analyze. Use `typeInEditor` only for text that does not require language-server analysis.
- Use `waitForLanguageServer` before interacting with the tree; prefer verifier polling over long static waits. Short static waits are acceptable only for UI rendering settle time.
- Native file/folder pickers are suppressed in the smoke-test driver; drive VS Code's internal quick-pick with `fillQuickInput` instead of relying on `mockOpenDialog`.
- Quote action arguments that contain spaces:

```yaml
action: 'clickViewTitleAction "Java Projects" "Unlink with Editor"'
```

## Verification rules

- Add deterministic verification to every meaningful step. The natural-language `verify` field is context for humans and failure analysis; it is not pass/fail authority by itself, and it is auto-passed when a plan runs with `--no-llm`.
- Use `verifyTreeItem` (with `name:`, optional `exact: true`, and `visible: false` for absence) as the authoritative check for Java Projects tree state.
- Use `verifyFile` after operations that create, modify, or delete files on disk (new type, export jar, permanent delete). VS Code can open duplicate editor tabs with stale buffers, so prefer file-content checks over editor checks after such operations.
- Use `verifyEditorTab` to assert which file an action opened, and `verifyClipboard` for copy-path commands.
- On state-check steps whose only assertion is a deterministic verifier, omit the `verify:` field to avoid false LLM failures.
- Use screenshots only as diagnostics produced by AutoTest; do not make screenshots the only evidence of pass/fail.

## Local validation commands

```powershell
npx -y @vscjava/vscode-autotest validate test\e2e-plans\<name>.yaml
npm install        # first time only; on later iterations run just the commands below
npm run build-server
npx @vscode/vsce package -o vscode-java-dependency.vsix
npx -y @vscjava/vscode-autotest run test\e2e-plans\<name>.yaml --vsix vscode-java-dependency.vsix --no-llm
```
