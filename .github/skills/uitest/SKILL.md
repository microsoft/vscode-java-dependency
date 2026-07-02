---
name: uitest
description: Write, update, run, or debug vscode-java-dependency (Project Manager for Java) UI/E2E tests using AutoTest YAML plans. Use when the user asks for a UI test, E2E test, VS Code UI validation, Java Projects tree/view test, referenced-library test, or autotest plan.
---

# UI/E2E tests with AutoTest

Use this skill to add or update UI/E2E coverage for `vscode-java-dependency` (Project Manager for Java).

The repository uses `@vscjava/vscode-autotest`: YAML plans in `test/e2e-plans/*.yaml` launch VS Code, install the Extension Pack for Java (`vscjava.vscode-java-pack`) plus a local VSIX of this extension, execute user-facing actions against the Java Projects view, capture screenshots, and write `test-results/<plan>/results.json`.

## Prerequisites (local)

- Node.js >= 18 and JDK 21+ installed and on `PATH` (JDK 21 is required to build the `jdtls.ext` OSGi bundle).
- Close any running VS Code instance before running a plan locally; a running instance can block AutoTest from launching its own VS Code.
- Workspace fixtures are in-repo — no external clones are needed. Plans reference `../maven` (`test/maven`, a `maven-archetype-quickstart` project) or `../invisible` (`test/invisible`, an unmanaged-folder project).

## Workflow

1. Identify the scenario and search `test/e2e-plans/*.yaml` for an existing plan that already covers the area (project explorer, view modes, classpath, export jar, new types, file operations, delete, copy paths, refresh, build lifecycle, autorefresh).
2. Update the existing plan when possible. Create a new `test/e2e-plans/java-dep-<scenario>.yaml` only when no existing plan fits.
3. Use stable AutoTest actions and deterministic verifiers. Do not add raw Playwright tests or screenshot-only checks.
4. Validate the plan:

```powershell
npx -y @vscjava/vscode-autotest validate test\e2e-plans\<name>.yaml
```

5. If validating the current branch, build the OSGi bundle and package the extension:

```powershell
npm install          # first time only; on later iterations run just the two commands below
npm run build-server
npx @vscode/vsce package -o vscode-java-dependency.vsix
```

6. Run the plan against the packaged VSIX:

```powershell
npx -y @vscjava/vscode-autotest run test\e2e-plans\<name>.yaml --vsix vscode-java-dependency.vsix --output test-results\<name>
```

   Add `--no-llm` to skip natural-language `verify:` fields and rely only on deterministic verifiers for a fast local loop. Run the whole suite with `npm run test-e2e` (`autotest run-all test/e2e-plans --no-llm`).

7. Inspect `test-results/<name>/results.json` and `test-results/<name>/screenshots/`.
8. Iterate based on the failure cause:
   - **Incorrect plan**: fix the YAML and rerun step 6. No rebuild is needed.
   - **Product code fix**: after editing extension source (`src/**`) or the OSGi bundle (`jdtls.ext/**`), re-run step 5 (rebuild + repackage the VSIX) before rerunning step 6. Never rerun against a stale VSIX.
   - **Product bug (report only)**: report the observed behavior and cite the failing step, screenshot, and result reason.

## Authoring rules

- For most plans, use:

```yaml
setup:
  extension: "vscjava.vscode-java-pack"
  vscodeVersion: "stable"
  workspace: "../maven"
  settings:
    java.configuration.checkProjectSettingsExclusions: false
    workbench.startupEditor: "none"
```

- Use `--vsix vscode-java-dependency.vsix` to test current-branch changes; do not rely on a marketplace copy of `vscjava.vscode-java-dependency`.
- Use `../invisible` (not `../maven`) for referenced-library / classpath commands, which only apply to unmanaged-folder projects.
- Prefer `executeVSCodeCommand <commandId>` for command-driven UI (e.g. `javaProjectExplorer.focus`, `java.view.package.revealInProjectExplorer`, `workbench.actions.treeView.javaProjectExplorer.collapseAll`).
- Drive the tree with `expandTreeItem <name>` and title-bar buttons with `clickViewTitleAction "Java Projects" "<action>"`.
- Prefer `verifyTreeItem` for tree state, `verifyFile` for generated/modified/deleted files, `verifyEditorTab` for opened tabs, and `verifyClipboard` for copy-path commands.
- Use `waitForLanguageServer` before tree interactions, and `insertLineInFile` for Java source edits that JDT LS must observe.
- Free sidebar space (`closeAuxiliaryBar`, `collapseSidebarSection OUTLINE`/`TIMELINE`, `collapseWorkspaceRoot`) before asserting tree rows.
- Keep step IDs unique, descriptive, and kebab-case. Omit `verify:` on steps whose only assertion is a deterministic verifier.
- Avoid hard-coded coordinates and brittle DOM structure assumptions.

## CI

The repository workflow `.github/workflows/e2eUI.yml` runs on push and pull requests to `main`. It lints, discovers `test/e2e-plans/*.yaml` into a matrix, builds a branch VSIX per OS, runs every plan on Windows and Linux as independent matrix cells, and uploads `test-results/` artifacts plus an aggregate summary.

Each plan surfaces as its own PR check, so a new `test/e2e-plans/*.yaml` is picked up automatically without editing the workflow.
