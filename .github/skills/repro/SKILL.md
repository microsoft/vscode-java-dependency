---
name: repro
description: Reproduce a reported vscode-java-dependency (Project Manager for Java) bug from a GitHub issue, using the reporter's project. Decide whether a UI/E2E test is needed, reproduce with AutoTest when it is, and leave a committed regression test. Use when an issue is assigned to Copilot, when asked to reproduce/confirm a bug, or when triaging a "needs-repro" report.
---

# Reproduce a reported bug

Use this skill when an issue is assigned to Copilot (or you are asked to reproduce/confirm a report) for `vscode-java-dependency` (Project Manager for Java).

Goal: turn a bug report into a **deterministic, committed reproduction** that fails before the fix and passes after it. Prefer the smallest reproduction that proves the bug. Not every bug needs a UI test — decide first.

## 1. Extract the report

From the issue body (and the `bug_report` template fields) collect:

- **Repro project** — a public GitHub repo link, an attached zip, or an inline `pom.xml` / `build.gradle` + sources. If none is provided and the bug is environment-specific, ask for one and label the issue `needs-more-info` instead of guessing.
- **Steps to reproduce**, **expected** vs **actual** behavior, and the affected surface (tree view, context menu, command id, classpath, export jar, project creation, etc.).
- **Versions** — VS Code, Extension Pack for Java, JDK, OS.

## 2. Decide: does this need a UI/E2E test?

The reproduction and the fix-proof are two different questions — decide each:

- **Reproduction** can often be non-UI or even a code read, especially for simple, obvious bugs. Prefer the cheapest reproduction that captures the report.
- **Fix-proof** is where a UI/E2E test earns its cost: a red run before the fix and a green run after, with screenshots, is the strongest evidence for a user-facing bug. If the bug is user-facing, favour leaving a committed UI plan even when you first reproduced it another way.

**Use a UI/E2E AutoTest plan (`uitest` skill) when the bug is in the user-facing surface**, e.g.:

- Java Projects tree rendering, ordering, labels, icons, or node presence/absence.
- Context-menu / inline title actions, command palette entries, view focus/reveal.
- Referenced Libraries / classpath UI (`../invisible` project), export jar, new type creation, link-with-editor, view modes.

**Do NOT use a UI test — reproduce with a unit test or code analysis — when the bug is:**

- Pure logic / data structures reachable from the extension API → add or extend a `test/maven-suite` test.
- In the Java OSGi backend (`jdtls.ext/**`) → reproduce with a `jdtls.ext` JUnit test or by inspecting the LSP delegate command handler.
- Build scripts, packaging, activation events, `package.json` contributions, or documentation → reproduce by reading/running the relevant script; no VS Code launch needed.

When unsure, prefer the cheaper non-UI reproduction first; escalate to a UI test only if the behavior cannot be observed without the running view.

## 3. Bring in the reporter's project

Keep the committed footprint small and CI-reproducible:

- **Public repo**: clone it as a sibling at runtime and point the plan's `workspace` at it while iterating locally:

  ```powershell
  git clone --depth 1 <repo-url> ..\repro-issue-<n>
  ```

- **Zip / inline**: recreate the project under `test\e2e-fixtures\issue-<n>\` (or reuse `test/maven` / `test/invisible` if the existing fixtures already trigger the bug).
- Once reproduced, **distill it to the minimal fixture** that still fails and commit that (not the whole user project) so the regression test runs in CI without external clones or large binaries.

## 4. Reproduce

**UI path** — create `test/e2e-plans/repro-issue-<n>.yaml` following the `uitest` skill and `.github/instructions/uitest-plan.instructions.md`:

```powershell
npx -y @vscjava/vscode-autotest validate test\e2e-plans\repro-issue-<n>.yaml
npm run build-server
npx @vscode/vsce package -o vscode-java-dependency.vsix
npx -y @vscjava/vscode-autotest run test\e2e-plans\repro-issue-<n>.yaml --vsix vscode-java-dependency.vsix --no-llm --output test-results\repro-issue-<n>
```

Author the plan step-by-step for the **actions**, but you do not need a verifier on every step — put a deterministic verifier (`verifyTreeItem` / `verifyFile` / `verifyEditorTab` / `verifyClipboard`) on the **decisive assertion step** (the one that captures the bug) and on any step prone to a silent no-op. That decisive verifier must assert the **expected** behavior, so it **fails on the current (buggy) build**. Inspect `test-results/repro-issue-<n>/results.json` and the screenshots to confirm the failure matches the report, and keep the red-run screenshot as before-fix evidence.

**Non-UI path** — add the failing `test/maven-suite` or `jdtls.ext` test and run the existing suite (`npm test`, or the `jdtls.ext` Maven test) to confirm it fails.

## 5. Fix, then prove it

1. Fix the product code (`src/**` for TS, `jdtls.ext/**` for the OSGi backend).
2. **Rebuild and repackage the VSIX** (`npm run build-server` + `vsce package`) before rerunning any UI plan — never rerun against a stale VSIX.
3. Rerun the reproduction; the same plan/test must now pass (red → green).
4. Keep both runs' evidence: the **before** (red) and **after** (green) screenshots plus the `results.json` reason. The green screenshot is the primary proof that the fix works — attach it (and the before/after pair) to the PR.
5. Leave the reproduction committed as a permanent regression test. `.github/workflows/e2eUI.yml` discovers `test/e2e-plans/*.yaml` automatically, so `repro-issue-<n>.yaml` becomes its own CI check with no workflow edits.

## 6. Report back

Every PR or comment must state **how you reproduced** (UI plan vs unit test vs code read) and the **execution status** (ran red→green with screenshots attached, or could not execute — e.g. the UI run was blocked — and why).

- **Reproduced + fixed**: open a PR that attaches the before (red) and after (green) screenshots as the fix-proof, cites the failing step / `results.json` reason, and notes the committed reproduction now passes. Reference the issue.
- **Reproduced, report only**: comment with the reproduction (plan or test), the observed vs expected behavior, and the exact failing step.
- **Reproduced but could not run the UI test** (e.g. VS Code download / Marketplace blocked): commit the plan, explain what fails and why it could not execute, and either fall back to a non-UI proof or ask a maintainer to unblock — do not claim a green run you did not observe.
- **Could not reproduce**: comment with what you tried and precisely what is missing; label `needs-more-info`. Do not fabricate a fix for an unreproduced bug.

## Environment notes

- The Copilot coding agent environment is prepared by `.github/workflows/copilot-setup-steps.yml` (JDK 21, Node 20, AutoTest, Xvfb, a baseline VSIX). Assume these are present.
- That setup runs **before the agent firewall**, and its final step pre-downloads VS Code (stable) and the `vscjava.vscode-java-pack` extensions into AutoTest's `<repo>/.vscode-test` cache (via `.github/scripts/prewarm-vscode.js`). So the firewalled UI run should launch offline from that warm cache — you normally do **not** need to fetch VS Code or Marketplace bits yourself.
- If the pre-warm did not run (e.g. an older branch) or the cache is cold, AutoTest will try to download VS Code + install `vscjava.vscode-java-pack` at run time. Those hosts (VS Code CDN + Marketplace) are firewall-blocked by default — if that happens, fall back to the non-UI path and note the limitation, or ask a maintainer to allow those hosts.
- Always run AutoTest with `--no-llm` in the agent so pass/fail comes only from deterministic verifiers.
