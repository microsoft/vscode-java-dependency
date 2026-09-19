#!/usr/bin/env node
// Repro red→green gate judge.
//
// Decides, from two AutoTest `results.json` files, whether a repro plan
// genuinely proves a bug fix: it must FAIL on the un-fixed base build (RED)
// and PASS on the fixed head build (GREEN). Run by the `repro-gate-*` jobs in
// .github/workflows/e2eUI.yml, once per repro-issue-<n>.yaml plan per OS.
//
// Usage:
//   node repro-gate.js <baseResultsJson> <headResultsJson> [planName] [os]
//
// Exit codes:
//   0  RED→GREEN proven (base failed a deterministic assertion, head all-pass)
//   1  gate failed — one of:
//        NOT_REPRODUCED  base passed        → plan does not reproduce the bug
//        NOT_FIXED       head still fails   → fix does not resolve the bug
//        INCONCLUSIVE    base/head crashed or errored (infra flake) → retry
//
// Why summary.failed (not the process exit code) decides RED:
//   `autotest run` exits 1 for BOTH a real assertion failure and a crash /
//   infra error. Only a deterministic assertion `fail` (summary.failed >= 1,
//   not `errors`, not `crashed`) counts as a genuine reproduction. A crash on
//   base would otherwise be mis-read as "reproduced".

"use strict";

const fs = require("fs");

function loadReport(p) {
  try {
    const raw = fs.readFileSync(p, "utf8");
    const json = JSON.parse(raw);
    return { ok: true, ...json };
  } catch (e) {
    return { ok: false, missing: true, loadError: e.message };
  }
}

function summaryOf(r) {
  const s = r.summary || {};
  return {
    total: s.total ?? 0,
    passed: s.passed ?? 0,
    failed: s.failed ?? 0,
    errors: s.errors ?? 0,
    skipped: s.skipped ?? 0,
  };
}

function failingSteps(r) {
  return (r.results || [])
    .filter((s) => s.status === "fail" || s.status === "error")
    .map((s) => ({
      stepId: s.stepId,
      action: s.action,
      status: s.status,
      reason: (s.reason || "").toString().slice(0, 300),
    }));
}

function classifyBase(r) {
  // A trustworthy RED = did not crash AND at least one deterministic
  // assertion `fail`. Errors / crashes are infra noise, not reproduction.
  if (!r.ok || r.crashed === true) return "CRASHED";
  const s = summaryOf(r);
  if (s.failed >= 1) return "RED";
  if (s.errors >= 1) return "ERRORED";
  return "GREEN"; // ran clean, nothing failed → did NOT reproduce
}

function classifyHead(r) {
  if (!r.ok || r.crashed === true) return "CRASHED";
  const s = summaryOf(r);
  if (s.failed === 0 && s.errors === 0) return "GREEN";
  return "RED"; // fix build still failing / erroring
}

function icon(kind) {
  return { RED: "❌", GREEN: "✅", CRASHED: "💥", ERRORED: "⚠️", ERROR: "⚠️" }[kind] || "❔";
}

function main() {
  const [baseJson, headJson, planNameArg, osArg] = process.argv.slice(2);
  if (!baseJson || !headJson) {
    console.error("usage: repro-gate.js <baseResultsJson> <headResultsJson> [plan] [os]");
    process.exit(2);
  }
  const plan = planNameArg || "repro-plan";
  const os = osArg || process.env.RUNNER_OS || "";

  const base = loadReport(baseJson);
  const head = loadReport(headJson);
  const baseKind = classifyBase(base);
  const headKind = classifyHead(head);
  const baseSum = summaryOf(base);
  const headSum = summaryOf(head);

  // ── Verdict ──────────────────────────────────────────────
  let verdict, exit, message;
  if (baseKind === "CRASHED" || baseKind === "ERRORED") {
    verdict = "INCONCLUSIVE";
    exit = 1;
    message =
      `Base (un-fixed) run did not produce a clean assertion result ` +
      `(${baseKind.toLowerCase()}). This is an infrastructure flake, not a ` +
      `reproduction — re-run the job. If it persists, the editor is not ` +
      `launching (check the pre-warm / .vscode-test cache).`;
  } else if (baseKind === "GREEN") {
    verdict = "NOT_REPRODUCED";
    exit = 1;
    message =
      `The repro plan PASSED on the un-fixed base build, so it does NOT ` +
      `reproduce the bug (no RED). Tighten the decisive assertion so it ` +
      `asserts the EXPECTED behaviour and therefore fails on the buggy build.`;
  } else if (headKind === "CRASHED") {
    verdict = "INCONCLUSIVE";
    exit = 1;
    message =
      `Base reproduced the bug (RED), but the fixed head run crashed — ` +
      `infrastructure flake, re-run the job.`;
  } else if (headKind === "RED") {
    verdict = "NOT_FIXED";
    exit = 1;
    message =
      `The fix build STILL FAILS the repro plan (no GREEN), so the bug is ` +
      `not resolved. See the failing head step(s) below.`;
  } else {
    verdict = "PROVEN";
    exit = 0;
    message = `RED→GREEN proven: the bug reproduces on base and is fixed on head.`;
  }

  // ── Markdown report ──────────────────────────────────────
  const title = `Repro red→green gate — \`${plan}\`${os ? ` (${os})` : ""}`;
  const baseDecisive =
    baseKind === "RED"
      ? failingSteps(base).map((s) => `\`${s.stepId}\`: ${s.reason || s.status}`).join("<br>") || "—"
      : baseKind === "GREEN"
      ? "no step failed (did not reproduce)"
      : (base.crashReason || base.loadError || baseKind);
  const headDecisive =
    headKind === "GREEN"
      ? `all ${headSum.total} step(s) passed`
      : headKind === "RED"
      ? failingSteps(head).map((s) => `\`${s.stepId}\`: ${s.reason || s.status}`).join("<br>") || "—"
      : (head.crashReason || head.loadError || headKind);

  const md = [
    `### ${title}`,
    ``,
    `**Verdict: ${exit === 0 ? "✅" : "❌"} ${verdict}** — ${message}`,
    ``,
    `| Build | Under test | Result | Steps (p/f/e) | Decisive |`,
    `|-------|-----------|--------|---------------|----------|`,
    `| base | \`main\` (un-fixed) | ${icon(baseKind)} ${baseKind} | ${baseSum.passed}/${baseSum.failed}/${baseSum.errors} | ${baseDecisive} |`,
    `| head | PR (fix) | ${icon(headKind)} ${headKind} | ${headSum.passed}/${headSum.failed}/${headSum.errors} | ${headDecisive} |`,
    ``,
    exit === 0
      ? `> The base build reproduces the bug and the head build fixes it — a genuine regression guard.`
      : `> Gate blocked: ${verdict}. ${message}`,
    ``,
  ].join("\n");

  console.log(md);

  // GitHub job summary
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    try {
      fs.appendFileSync(summaryFile, md + "\n");
    } catch (e) {
      console.error(`(could not write job summary: ${e.message})`);
    }
  }

  // Workflow annotation
  if (exit === 0) {
    console.log(`::notice title=Repro gate ${plan}::${verdict} — ${message}`);
  } else {
    console.log(`::error title=Repro gate ${plan}::${verdict} — ${message}`);
  }

  process.exit(exit);
}

main();
