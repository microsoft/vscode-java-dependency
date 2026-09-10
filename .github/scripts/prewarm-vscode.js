#!/usr/bin/env node
/*
 * Pre-download VS Code + the Java extensions into AutoTest's cache BEFORE the
 * Copilot coding agent's firewall is enabled.
 *
 * AutoTest (`@vscjava/vscode-autotest`) launches VS Code via `@vscode/test-electron`:
 *   1. downloadAndUnzipVSCode(version)            -> <cwd>/.vscode-test/vscode-<...>
 *   2. resolveCliArgsFromVSCodeExecutablePath()   -> --extensions-dir=<cwd>/.vscode-test/extensions
 *   3. code --install-extension <id> --force      -> pulls Marketplace bits into that extensions dir
 *
 * The VS Code CDN (update.code.visualstudio.com) and the Marketplace are NOT on the
 * Copilot agent's default firewall allowlist, so those network calls fail at run time.
 * This script performs the exact same three operations during `copilot-setup-steps`
 * (which runs before the firewall), so the caches are warm and the firewalled UI run
 * hits them offline.
 *
 * Because `@vscode/test-electron` derives its cache from `process.cwd()`, this MUST run
 * from the repository root — the same directory AutoTest runs from at agent time.
 *
 * Env overrides:
 *   VSCODE_VERSION       VS Code channel/version to warm (default: "stable")
 *   PREWARM_EXTENSIONS   comma-separated extension ids (default: "vscjava.vscode-java-pack")
 */
"use strict";

const path = require("path");
const cp = require("child_process");

function resolveTestElectron() {
  // Prefer the exact copy that the globally installed AutoTest uses, so the
  // version and default-cache-path logic match the agent run byte-for-byte.
  const candidates = [];
  try {
    const globalRoot = cp.execSync("npm root -g", { encoding: "utf-8" }).trim();
    candidates.push(path.join(globalRoot, "@vscjava", "vscode-autotest"));
    candidates.push(globalRoot);
  } catch {
    /* npm not on PATH — fall back to local resolution below */
  }
  candidates.push(process.cwd());
  try {
    const entry = require.resolve("@vscode/test-electron", { paths: candidates });
    return require(entry);
  } catch {
    // Last resort: a plain require (works if it is a local dependency).
    return require("@vscode/test-electron");
  }
}

async function main() {
  const version = process.env.VSCODE_VERSION || "stable";
  const extensions = (process.env.PREWARM_EXTENSIONS || "vscjava.vscode-java-pack")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } = resolveTestElectron();

  console.log(`⬇️  Pre-downloading VS Code "${version}" into ${path.join(process.cwd(), ".vscode-test")} ...`);
  const vscodePath = await downloadAndUnzipVSCode(version);
  console.log(`✅ VS Code ready: ${vscodePath}`);

  const [cli, ...baseArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodePath);
  const extensionsDir = baseArgs.find((a) => a.startsWith("--extensions-dir="))?.split("=")[1];
  console.log(`📁 Extensions dir: ${extensionsDir ?? "(default)"}`);

  let failures = 0;
  for (const ext of extensions) {
    console.log(`📦 Installing ${ext} (+ Extension Pack members) ...`);
    try {
      cp.execFileSync(cli, [...baseArgs, "--install-extension", ext, "--force"], {
        stdio: "inherit",
        timeout: 300_000,
        env: { ...process.env },
        shell: process.platform === "win32",
      });
      console.log(`✅ Installed ${ext}`);
    } catch (e) {
      failures++;
      console.warn(`⚠️  Failed to install ${ext}: ${e.message}`);
    }
  }

  if (failures > 0) {
    // Non-fatal: a missing extension only degrades UI reproduction, and the agent
    // can still fall back to the non-UI path. Surface it without aborting setup.
    console.warn(`⚠️  ${failures} extension(s) failed to pre-install; UI reproduction may be degraded.`);
  }
  console.log("🎉 VS Code + Java extensions pre-warmed for AutoTest.");
}

main().catch((err) => {
  console.error("❌ Pre-warm failed:", err);
  process.exit(1);
});
