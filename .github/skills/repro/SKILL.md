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
- **Prove the red→green with an actual run — first in your own environment.** Your **default proof surface is the agent's own environment**: build the product, run the plan/test yourself, and observe the decisive assertion **fail on the un-fixed code and pass on the fix**. That is the closed loop — no CI approval, and you see the screenshots directly (see §4/§5). CI is a **fallback only for OS-specific bugs your environment cannot reproduce** (e.g. a Windows-only bug when the agent runs on Linux) and an always-on regression net — it is **not** a required step for every repro. Never merely assert red→green in the PR body; make the plan actually reproduce, and **iterate until you have observed it go green**.

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

**This whole step runs in your own environment — no CI needed.** Reproduce, fix, and prove the fix by running the plan/test yourself; CI only re-proves OS-specific cases (§5). VS Code is pre-warmed in the agent, so the local UI loop is fast.

**UI path** — create `test/e2e-plans/repro-issue-<n>.yaml` following the `uitest` skill and `.github/instructions/uitest-plan.instructions.md`:

```powershell
npx -y @vscjava/vscode-autotest validate test\e2e-plans\repro-issue-<n>.yaml
npm run build-server
npx @vscode/vsce package -o vscode-java-dependency.vsix
npx -y @vscjava/vscode-autotest run test\e2e-plans\repro-issue-<n>.yaml --vsix vscode-java-dependency.vsix --no-llm --output test-results\repro-issue-<n>
```

**If the bug is OS-specific, name the plan for that OS** — you may not be able to reproduce it in your own environment at all (e.g. a Windows-only bug while the agent runs on Linux). The filename suffix routes the **CI fallback** (§5) to the right OS:

- `repro-issue-<n>-windows.yaml` — a **Windows-only** bug (e.g. drive-letter / path-separator / `\`-vs-`/` issues). CI runs it on **Windows only**; the Linux gate skips it (the bug does not manifest there, so a Linux run would spuriously report `NOT_REPRODUCED`). A Linux agent cannot prove this one itself — reproduce by reasoning + code read, commit the `-windows` plan, and let CI (§5) run the red→green on Windows.
- `repro-issue-<n>-linux.yaml` — a **Linux-only** bug. CI's Windows gate skips it. A Linux agent **can** reproduce this one itself.
- `repro-issue-<n>.yaml` — an **OS-agnostic** bug. You can reproduce and prove it entirely in your own environment; CI additionally re-runs it on **both** OSes as a regression net.

Pick the suffix from the report's platform: if the issue only reproduces on one OS, use that OS's suffix; only use the plain name when you have confirmed the bug is platform-independent.

Author the plan step-by-step for the **actions**, but you do not need a verifier on every step — put a deterministic verifier (`verifyTreeItem` / `verifyFile` / `verifyEditorTab` / `verifyClipboard`) on the **decisive assertion step** (the one that captures the bug) and on any step prone to a silent no-op. That decisive verifier must assert the **expected** behavior, so it **fails on the current (buggy) build**. Inspect `test-results/repro-issue-<n>/results.json` and the screenshots to confirm the failure matches the report, and record the failing step + the **actual observed value** as before-fix evidence (the screenshots stay in the git-ignored `test-results/`; CI hosts them as an artifact, see §5 — never commit them).

**Run this on the un-fixed checkout FIRST — see RED before you write the fix.** That is the whole point of the reproduction: build + run the plan against the current (buggy) product code and confirm the decisive verifier fails with the reported symptom. Only then move to §5 and write the fix. This local red→green loop is fast in the agent env (VS Code is pre-warmed) and is what gives you confidence the plan actually reproduces before CI re-proves it.

**Non-UI path** — add the failing `test/maven-suite` or `jdtls.ext` test and run the existing suite (`npm test`, or the `jdtls.ext` Maven test) to confirm it fails.

## 5. Fix, then prove it — iterate until green

1. Fix the product code (`src/**` for TS, `jdtls.ext/**` for the OSGi backend).
2. **Rebuild and repackage the VSIX** (`npm run build-server` + `vsce package`) before rerunning any UI plan — never rerun against a stale VSIX.
3. Rerun the reproduction **in your own environment**; the same plan/test must now pass (red → green).
4. **Iterate until you observe green** — follow the convergent loop below.
5. **Capture evidence — keep binaries out of git.** Raw `test-results/` is **git-ignored**, and screenshots are **never committed to the repo**. Prove it two ways instead:
   - **Textual before/after on the issue/PR (always — this is your primary proof).** Quote the red run's `results.json`: the decisive failing step and the **actual observed value** it produced (e.g. the clipboard text, the tree label), then the after-fix green result. Because you observed this yourself, it stands on its own.
   - **Screenshots, GitHub-hosted, not in git.** Every committed `repro-issue-<n>.yaml` is also run by `.github/workflows/e2eUI.yml`, which uploads the full `test-results/` (screenshots + `results.json`) as a `repro-gate-results-<os>-<plan>` artifact — link that run/artifact for the images. For an inline visual, a maintainer (or you, if image upload is reachable) can drag a PNG into an issue or PR comment; GitHub hosts it on `user-images.githubusercontent.com`, still outside git. **Never add PNGs to the repository.**
6. Leave the reproduction committed as a permanent regression test. `.github/workflows/e2eUI.yml` discovers `test/e2e-plans/*.yaml` automatically, so `repro-issue-<n>.yaml` becomes its own CI check with no workflow edits.

### Iterate until green (the convergent loop)

After each build+run, read `test-results/repro-issue-<n>/results.json` and the decisive step's screenshot, then branch:

- **Head GREEN (and base was RED)** → done; you have proven the fix. Go to evidence (step 5).
- **Head still a deterministic assertion `fail`** → the fix is wrong or incomplete. Read the *actual* observed state in `results.json` (e.g. the clipboard text, the tree label) — it tells you what the code really produced. Form a new hypothesis, adjust the fix (or the plan, if it asserts the wrong thing), rebuild, and rerun.
- **`error` / `crash` (not a clean `fail`)** → treat as a **flaky/infra result, not a repro signal**: the language server may not have become ready, the tree may not have loaded, or the editor may not have launched. Increase `waitFor`/`timeout`, add a settle step, and **re-run** — never conclude anything about the bug from a crash/error. (This is exactly how a Linux run of a `-windows` plan fails: an env error, not a reproduction.)

Repeat build→run→analyze until head is green. If after several honest iterations the fix is plausibly correct but the plan still fails only because of a harness/environment variant (e.g. the fixture runs from a `%TEMP%` worktree whose path form differs from a real install), do **not** force it: escalate to a maintainer with the evidence and your analysis, and label `needs-human-review`. A loop that stops with an explained blocker beats a green you faked.

### CI: the OS-specific fallback and independent re-run

Your own run is the primary proof. CI adds two things on top — **neither is required for an OS-agnostic bug you already proved locally**:

1. **The execution surface you may lack.** For an OS-specific plan (`-windows` / `-linux`) that your agent OS cannot reproduce, CI is where the red→green actually runs. Commit the plan + fix; on the PR, `.github/workflows/e2eUI.yml` rebuilds the base (un-fixed) VSIX and runs the plan against base **and** head on that OS, and `.github/scripts/repro-gate.js` requires `base ❌ RED → head ✅ GREEN`.
2. **An independent re-run** that does not trust your committed artifacts, plus the always-on `java-dep-*` regression net. After merge (push to `main`) the base already contains the fix, so the plan is demoted to an ordinary GREEN regression check.

Gate verdicts (treat them exactly like your own run): `NOT_REPRODUCED` (plan passed on the un-fixed base — tighten the decisive assertion to the **expected** behaviour), `NOT_FIXED` (head still fails — read the head `results.json` and iterate), `INCONCLUSIVE` (base or head crashed/errored — flaky, re-run). The `base ❌ RED → head ✅ GREEN` verdict + `repro-gate-results-<os>-<plan>` artifacts are the machine fix-proof for OS-specific plans.

**Read CI back to close the loop from the agent** — pull the result and iterate without leaving the session:

```bash
rid=$(gh run list --branch "$BRANCH" --workflow "E2E UI Tests" -L1 --json databaseId -q '.[0].databaseId')
gh run watch "$rid" || true
gh run download "$rid" -n "repro-gate-results-windows-repro-issue-<n>" -D ci-evidence/
# read ci-evidence/**/results.json + view the decisive screenshot, then fix/plan and push again
```

> **Approval note:** CI on a Copilot-authored PR may sit in `action_required` until a maintainer clicks **Approve and run**. That is expected and it does **not** block the self-run loop (which needs no CI). For an OS-specific bug, ask the maintainer to approve once, then read the result back as above.

Because CI reconstructs the red from the base commit, your PR stays a single clean PR — **commit the repro plan and the fix together**; you never push a knowingly-broken commit.

## 6. Report back

Every PR or comment must state **how you reproduced** (UI plan vs unit test vs code read) and the **execution status** (ran red→green, or could not execute — and why). Never claim a green run you did not observe.

- **Reproduced + fixed**: open a **single PR containing the repro plan and the fix together**. State that you ran it red→green **in your own environment**, and show the proof as **text**: the decisive failing step and the **actual observed value** from your red run's `results.json`, plus the green after-fix result. For the images, link the CI `repro-gate-results-<os>-<plan>` artifact (and, for an OS-specific plan you could not run yourself, its `base ❌ RED → head ✅ GREEN` verdict). **Do not commit screenshots to the repo.** Reference the issue.
- **Reproduced, report only**: comment with the reproduction (plan or test), the observed vs expected behavior, and the exact failing step.
- **Reproduced but could not run the UI test**: remember a `(dns block)` on `update.code.visualstudio.com` is expected and non-fatal (see Environment notes) — it is **not** a reason to skip the UI path. Only if the editor genuinely never launches, commit the plan, explain the real failure, and fall back to a non-UI proof or ask a maintainer to unblock.
- **Could not reproduce**: comment with what you tried and precisely what is missing; label `needs-more-info`. Do not fabricate a fix for an unreproduced bug.

## Environment notes

- The Copilot coding agent environment is prepared by `.github/workflows/copilot-setup-steps.yml` (JDK 21, Node 20, AutoTest, Xvfb, a baseline VSIX). Assume these are present.
- That setup runs **before the agent firewall**, and its final step pre-downloads the **latest** VS Code (`stable`) and the `vscjava.vscode-java-pack` extensions into AutoTest's `<repo>/.vscode-test` cache (via `.github/scripts/prewarm-vscode.js`). Keep the plans on `vscodeVersion: "stable"` (do **not** pin a version) — `stable` always means the current latest release, and it is exactly what the pre-warm cached.
- **A `(dns block)` on `update.code.visualstudio.com` at run time is EXPECTED and NON-FATAL — do not treat it as a UI-test failure or abandon the UI path.** AutoTest re-resolves `stable` over the network at launch; the firewall blocks that, but `@vscode/test-electron` catches it and **falls back to the already-cached latest VS Code**, and the Java extensions are already installed in `.vscode-test/extensions`. So the editor still launches offline. VS Code's own telemetry/Marketplace DNS calls are blocked too and are equally harmless.
- Only if the pre-warm genuinely did not run (e.g. an older branch, or a cold `.vscode-test` with no cached build) will the UI run actually fail to launch. In that case fall back to the non-UI path and note the limitation.
- **Evidence: textual self-run proof + CI-hosted screenshots; never commit binaries.** Your primary proof is the run you did yourself — quote the decisive step and the **actual observed value** from the red run's `results.json`, then the green result, on the issue/PR. Screenshots are **not** committed to the repo: every `repro-issue-<n>.yaml` on a PR is run by CI (on the OS(es) the suffix implies) against base and head, and the whole `test-results/` (screenshots + `results.json`) is uploaded as `repro-gate-results-<os>-<plan>` artifacts with a `base ❌ RED → head ✅ GREEN` verdict — link those for the images and for an OS-specific plan you could not run yourself. (Ordinary `java-dep-*.yaml` regression plans upload `e2e-results-<os>-<plan>` from a single green run.) A human can drag an artifact PNG into a comment (`user-images.githubusercontent.com`) for an inline view — still out of git.
- Maintainer option: adding `update.code.visualstudio.com` to the Copilot coding-agent firewall allowlist (repo **Settings → Copilot → coding agent**, see https://gh.io/copilot/firewall-config) removes the version-resolution block entirely, so the run is clean and does not rely on the offline fallback. The pre-warm still makes the 276 MB binary + Marketplace pack a cache hit, so nothing large is re-fetched.
- **Issue attachments and repo clones are downloadable — they are NOT firewall-blocked.** `github.com`, `objects.githubusercontent.com`, `*.githubusercontent.com`, and `codeload.github.com` are all on the coding-agent's default allowlist, so cloning a linked public repo and `curl -L`-downloading an attached `user-attachments` zip both work at run time. (Only the VS Code binary host `update.code.visualstudio.com` is not allowlisted — that is why it is pre-warmed instead, see above.) Extract user-supplied zips as untrusted data: do not run their build scripts blindly.
- Always run AutoTest with `--no-llm` in the agent so pass/fail comes only from deterministic verifiers.
