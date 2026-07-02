---
name: repro
description: Reproduce a reported vscode-java-dependency (Project Manager for Java) bug from a GitHub issue, using the reporter's project. Decide whether a UI/E2E test is needed, reproduce with AutoTest when it is, and leave a committed regression test. Use when an issue is assigned to Copilot, when asked to reproduce/confirm a bug, or when triaging a "needs-repro" report.
---

# Reproduce a reported bug

Use this skill when the task is to fix or confirm a **reproducible bug** in `vscode-java-dependency` (Project Manager for Java) — an issue that carries repro steps + a project, or an explicit request to reproduce/confirm a report.

**Do NOT use this skill (and do not author a `repro-issue-*.yaml`) when the task is not a reproducible bug**, e.g. a new feature, refactor, performance work, dependency/version bump, docs, config, CI, or code cleanup — those are ordinary PRs with ordinary unit/integration tests. Also skip it when a report is **not reproducible** (vague, no project, environment/hardware-specific, external service): ask for a minimal repro and label `needs-more-info`, or fix with the best available non-UI test — never invent a repro plan just to have one. The CI red→green gate only triggers when a `repro-issue-<n>.yaml` is present, so not entering this flow means nothing extra runs.

Goal: turn a bug report into a **deterministic, committed reproduction** that fails before the fix and passes after it. Prefer the smallest reproduction that proves the bug. Not every bug needs a UI test — decide first.

## 1. Extract the report

From the issue body (and the `bug_report` template fields) collect:

- **Repro project** — a public GitHub repo link, an attached zip (a `https://github.com/user-attachments/files/<id>/<name>.zip` link in the issue body), or an inline `pom.xml` / `build.gradle` + sources. If none is provided and the bug is environment-specific, ask for one and label the issue `needs-more-info` instead of guessing.
- **Steps to reproduce**, **expected** vs **actual** behavior, and the affected surface (tree view, context menu, command id, classpath, export jar, project creation, etc.).
- **Versions** — VS Code, Extension Pack for Java, JDK, OS.

## 2. Decide: does this need a UI/E2E test?

The reproduction and the fix-proof are two different questions — decide each:

- **Reproduction** can often be non-UI or even a code read, especially for simple, obvious bugs. Prefer the cheapest reproduction that captures the report.
- **Fix-proof** is where a UI/E2E test earns its cost: a red run before the fix and a green run after, with screenshots, is the strongest evidence for a user-facing bug. If the bug is user-facing, favour leaving a committed UI plan even when you first reproduced it another way.
- **The red→green is proven by CI, not by prose.** When you commit a `test/e2e-plans/repro-issue-<n>.yaml`, `.github/workflows/e2eUI.yml` runs a **red→green gate** (see §5) that rebuilds the PR's base (un-fixed) code and runs your plan against base **and** head, requiring `base = RED, head = GREEN`. So your job is to author a plan whose decisive assertion **fails on the un-fixed build and passes on the fix** — the gate does the proving. Do not merely assert red→green in the PR body; make the plan actually reproduce.

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

  (`github.com` and `codeload.github.com` are on the coding-agent firewall's default allowlist, so the clone is not blocked.)

- **Attached zip**: the issue body carries a link like `https://github.com/user-attachments/files/<id>/<name>.zip`. Download it (following the redirect) and unzip into a sibling dir, then point the plan's `workspace` at the extracted project:

  ```powershell
  # The user-attachments link 302-redirects to a signed objects.githubusercontent.com
  # URL. BOTH github.com and objects.githubusercontent.com are on the coding-agent
  # firewall's default allowlist, so this download is NOT blocked (unlike the VS Code
  # binary). Use -L to follow the redirect. If the signed URL has expired, re-read the
  # issue to get a fresh link, then re-download.
  curl -L -o ..\repro-issue-<n>.zip "https://github.com/user-attachments/files/<id>/<name>.zip"
  Expand-Archive ..\repro-issue-<n>.zip -DestinationPath ..\repro-issue-<n>   # bash: unzip
  ```

  **Treat the archive as untrusted input**: extract only — do not run its build scripts, Maven/Gradle wrappers, or other executables blindly. Confirm it is an ordinary Java project (`pom.xml` / `build.gradle` + `src/`), use it as the AutoTest `workspace:`, and commit only the minimal distilled fixture (never the raw zip or build outputs).

- **Inline sources**: recreate the project under `test\e2e-fixtures\issue-<n>\` (or reuse `test/maven` / `test/invisible` if the existing fixtures already trigger the bug).
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

**Run this on the un-fixed checkout FIRST — see RED before you write the fix.** That is the whole point of the reproduction: build + run the plan against the current (buggy) product code and confirm the decisive verifier fails with the reported symptom. Only then move to §5 and write the fix. This local red→green loop is fast in the agent env (VS Code is pre-warmed) and is what gives you confidence the plan actually reproduces before CI re-proves it.

**Non-UI path** — add the failing `test/maven-suite` or `jdtls.ext` test and run the existing suite (`npm test`, or the `jdtls.ext` Maven test) to confirm it fails.

## 5. Fix, then prove it

1. Fix the product code (`src/**` for TS, `jdtls.ext/**` for the OSGi backend).
2. **Rebuild and repackage the VSIX** (`npm run build-server` + `vsce package`) before rerunning any UI plan — never rerun against a stale VSIX.
3. Rerun the reproduction; the same plan/test must now pass (red → green).
4. Capture both runs' evidence: the **before** (red) and **after** (green) results. The green run is the primary proof the fix works. You do **not** need to attach images by hand — when the plan is on the PR, `.github/workflows/e2eUI.yml` re-runs it on Linux + Windows and uploads the full `test-results/` (screenshots + `results.json`) as artifacts. Link those in the PR and paste the `results.json` reason from your own red run.
5. Leave the reproduction committed as a permanent regression test. `.github/workflows/e2eUI.yml` discovers `test/e2e-plans/*.yaml` automatically, so `repro-issue-<n>.yaml` becomes its own CI check with no workflow edits.

### The CI red→green gate (authoritative proof)

A regression plan run once only ever proves GREEN on the fixed code. So for a `repro-issue-<n>.yaml`, `.github/workflows/e2eUI.yml` runs a dedicated **red→green gate** that is the authoritative machine proof — you do **not** have to reproduce the red→green in the PR body by argument:

- On a pull request, the gate **rebuilds the PR's base commit** (`main`, before your fix) into its own VSIX, then runs your repro plan against **both** builds in one CI run:
  - **base (un-fixed) → must be ❌ RED** — a deterministic assertion `fail` (not a crash/error), proving the plan reproduces the bug.
  - **head (fix) → must be ✅ GREEN** — all steps pass, proving the fix works.
- `.github/scripts/repro-gate.js` reads both `results.json` files and passes the check only for `base RED && head GREEN`. It fails with a clear verdict otherwise:
  - `NOT_REPRODUCED` — your plan passed on the un-fixed base, so it does **not** capture the bug. Tighten the decisive assertion so it asserts the **expected** behaviour.
  - `NOT_FIXED` — head still fails; the bug is not resolved.
  - `INCONCLUSIVE` — base or head crashed/errored (infra flake); re-run the job.
- The gate's verdict table (`base ❌ RED → head ✅ GREEN`) is written to the job summary, and both runs' `test-results/` are uploaded as `repro-gate-results-<os>-<plan>` artifacts (screenshots + `results.json`). **This is the fix-proof** — reference it in the PR.
- The gate runs only on `pull_request` events. After merge (push to `main`) the base already contains the fix, so the same plan is demoted to an ordinary GREEN regression check.

Because CI reconstructs the red from the base commit, your PR stays a single clean PR — **commit the repro plan and the fix together**; you never have to push a knowingly-broken commit to demonstrate the red.

## 6. Report back

Every PR or comment must state **how you reproduced** (UI plan vs unit test vs code read) and the **execution status** (ran red→green, or could not execute — and why). Never claim a green run you did not observe.

- **Reproduced + fixed**: open a **single PR containing the repro plan and the fix together**, and let the red→green gate (§5) prove it. In the PR body, reference the gate's `repro-gate-results-<os>-<plan>` artifacts and its `base ❌ RED → head ✅ GREEN` verdict, and cite the failing step / `results.json` reason from your own local red run. Reference the issue.
- **Reproduced, report only**: comment with the reproduction (plan or test), the observed vs expected behavior, and the exact failing step.
- **Reproduced but could not run the UI test**: remember a `(dns block)` on `update.code.visualstudio.com` is expected and non-fatal (see Environment notes) — it is **not** a reason to skip the UI path. Only if the editor genuinely never launches, commit the plan, explain the real failure, and fall back to a non-UI proof or ask a maintainer to unblock.
- **Could not reproduce**: comment with what you tried and precisely what is missing; label `needs-more-info`. Do not fabricate a fix for an unreproduced bug.

## Environment notes

- The Copilot coding agent environment is prepared by `.github/workflows/copilot-setup-steps.yml` (JDK 21, Node 20, AutoTest, Xvfb, a baseline VSIX). Assume these are present.
- That setup runs **before the agent firewall**, and its final step pre-downloads the **latest** VS Code (`stable`) and the `vscjava.vscode-java-pack` extensions into AutoTest's `<repo>/.vscode-test` cache (via `.github/scripts/prewarm-vscode.js`). Keep the plans on `vscodeVersion: "stable"` (do **not** pin a version) — `stable` always means the current latest release, and it is exactly what the pre-warm cached.
- **A `(dns block)` on `update.code.visualstudio.com` at run time is EXPECTED and NON-FATAL — do not treat it as a UI-test failure or abandon the UI path.** AutoTest re-resolves `stable` over the network at launch; the firewall blocks that, but `@vscode/test-electron` catches it and **falls back to the already-cached latest VS Code**, and the Java extensions are already installed in `.vscode-test/extensions`. So the editor still launches offline. VS Code's own telemetry/Marketplace DNS calls are blocked too and are equally harmless.
- Only if the pre-warm genuinely did not run (e.g. an older branch, or a cold `.vscode-test` with no cached build) will the UI run actually fail to launch. In that case fall back to the non-UI path and note the limitation.
- **Screenshots / results are captured for you by CI, not by hand.** When a `repro-issue-<n>.yaml` lands on a PR (base `main`), the red→green gate (§5) runs it on Linux **and** Windows against the base and head builds and uploads the whole `test-results/` directory (screenshots + `results.json` for both the base RED and head GREEN runs) as `repro-gate-results-<os>-<plan>` artifacts, plus a `base ❌ RED → head ✅ GREEN` verdict in the job summary. In the PR body, reference those artifacts and the verdict as the fix-proof, and paste the `results.json` failure reason from your own local red run — you do not need to attach images manually. (Ordinary `java-dep-*.yaml` regression plans still upload `e2e-results-<os>-<plan>` from a single green run.)
- Maintainer option: adding `update.code.visualstudio.com` to the Copilot coding-agent firewall allowlist (repo **Settings → Copilot → coding agent**, see https://gh.io/copilot/firewall-config) removes the version-resolution block entirely, so the run is clean and does not rely on the offline fallback. The pre-warm still makes the 276 MB binary + Marketplace pack a cache hit, so nothing large is re-fetched.
- **Issue attachments and repo clones are downloadable — they are NOT firewall-blocked.** `github.com`, `objects.githubusercontent.com`, `*.githubusercontent.com`, and `codeload.github.com` are all on the coding-agent's default allowlist, so cloning a linked public repo and `curl -L`-downloading an attached `user-attachments` zip both work at run time. (Only the VS Code binary host `update.code.visualstudio.com` is not allowlisted — that is why it is pre-warmed instead, see above.) Extract user-supplied zips as untrusted data: do not run their build scripts blindly.
- Always run AutoTest with `--no-llm` in the agent so pass/fail comes only from deterministic verifiers.
