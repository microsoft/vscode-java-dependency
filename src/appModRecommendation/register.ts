import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";

const APP_MOD_EXTENSION_ID = "vscjava.migrate-java-to-azure";
const HOOK_FOLDER_NAME = "appmod-hook";
const HOOK_LOCATIONS_SETTING = "chat.hookFilesLocations";
const COPILOT_USER_HOOK_ROOT = ".copilot\\hooks";
const COPILOT_USER_HOOK_SCRIPT_FOLDER = "vscode-java-dependency-appmod";
const COPILOT_USER_HOOK_CONFIG_FILE = "vscode-java-dependency-appmod.json";
const HOOK_RECOMMENDATION_EVENT_FILE = "appmod-recommendation-event.json";
const LISTENER_DEBUG_LOG_FILE = "appmod-recommendation-listener-debug.log";
const HOOK_SETUP_DELAY_MS = 30_000;
let hookRecommendationListenerStarted = false;

const MODERNIZATION_PATTERNS: RegExp[] = [
    /\bupgrade(s|d|ing)?\b/i,
    /\bmoderni[sz](e|ation|ing)?\b/i,
    /\bmigrat(e|ion|ing)?\b/i,
    /\bjava\s*(8|11|17|21|25)\b/i,
    /\bspring\s*boot\s*(2|3)\b/i,
    /\bdependency\s+upgrade\b/i,
    /\bdependencies\s+upgrade\b/i,
];

export interface AppModPromptHookResult {
    handled: boolean;
    markdown?: string;
    reason?: string;
    buttons?: Array<{
        title: string;
        command: string;
        arguments?: unknown[];
    }>;
}

interface AppModRecommendationEvent {
    id?: string;
    message?: string;
    prompt?: string;
    cwd?: string;
}

export function registerAppModRecommendation(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("java.project.appMod.install", async () => {
            await vscode.commands.executeCommand(
                "workbench.extensions.installExtension",
                APP_MOD_EXTENSION_ID,
            );
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("java.project.appMod.viewExtension", async () => {
            await vscode.env.openExternal(
                vscode.Uri.parse(`vscode:extension/${APP_MOD_EXTENSION_ID}`),
            );
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("java.project.appMod.continueWithCopilot", async (prompt: string) => {
            await vscode.commands.executeCommand("workbench.action.chat.open", {
                query: prompt,
                isPartialQuery: true,
            });
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("java.project.appMod.resetSuppression", async () => {
            await deleteHookState(context);
            await vscode.window.showInformationMessage("App Modernization recommendation suppression was reset for this workspace.");
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("java.project.appMod.enableChatRecommendations", async () => {
            await enableChatRecommendations(context);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("java.project.appMod.disableChatRecommendations", async () => {
            await disableChatRecommendations(context);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("java.project.appMod.showChatRecommendationStatus", async () => {
            await showChatRecommendationStatus(context);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("java.project.appMod.showLastHookRecommendation", async () => {
            const shown = await readAndShowHookRecommendation(context, undefined);
            if (!shown) {
                await vscode.window.showInformationMessage("No new App Modernization hook recommendation event was found.");
            }
        }),
    );

    // Local POC command so you can test the logic before the real UserPromptSubmit hook is wired.
    context.subscriptions.push(
        vscode.commands.registerCommand("java.project.appMod.testPromptHook", async () => {
            const prompt = await vscode.window.showInputBox({
                title: "Test App Modernization prompt hook",
                prompt: "Enter a Copilot-style prompt to test local detection.",
                value: "upgrade this Spring Boot app to Java 21",
            });

            if (!prompt) {
                return;
            }

            const result = await handleUserPromptSubmit(context, prompt);

            if (!result.handled) {
                await vscode.window.showInformationMessage(`No App Modernization recommendation would be shown. Reason: ${result.reason ?? "unknown"}`);
                return;
            }

            const action = await vscode.window.showInformationMessage(
                stripMarkdown(result.markdown ?? "GitHub Copilot App Modernization is recommended for this task."),
                "Install App Modernization",
                "View Extension",
                "Continue with Copilot anyway",
            );

            if (action === "Install App Modernization") {
                await vscode.commands.executeCommand("java.project.appMod.install");
            } else if (action === "View Extension") {
                await vscode.commands.executeCommand("java.project.appMod.viewExtension");
            } else if (action === "Continue with Copilot anyway") {
                await vscode.commands.executeCommand("java.project.appMod.continueWithCopilot", prompt);
            }
        }),
    );

    // The VS Code Agent Hooks API is currently configured through hook files rather
    // than a TypeScript extension API, so the enable command registers a user-level
    // hook location that points at files owned by this extension.
}

export function enableAppModRecommendationsAfterProjectManagerViewInitialized(context: vscode.ExtensionContext): void {
    const setupDelay = setTimeout(() => {
        void enableChatRecommendations(context, { silent: true });
    }, HOOK_SETUP_DELAY_MS);
    context.subscriptions.push({
        dispose: () => clearTimeout(setupDelay),
    });
}

export async function handleUserPromptSubmit(
    _context: vscode.ExtensionContext,
    prompt: string,
    token?: vscode.CancellationToken,
): Promise<AppModPromptHookResult> {
    if (!isModernizationIntent(prompt)) {
        return { handled: false, reason: "prompt does not match modernization keywords" };
    }

    if (!(await isJavaWorkspace(token))) {
        return { handled: false, reason: "no Java project files were detected in this workspace" };
    }

    return {
        handled: true,
        markdown:
            "**Recommended extension**\n\n" +
            "This looks like a Java upgrade or modernization task. Install " +
            "**GitHub Copilot App Modernization** for guided Java/Spring upgrades, " +
            "code remediation, build fixes, and validation.",
        buttons: [
            {
                title: "Install App Modernization",
                command: "java.project.appMod.install",
            },
            {
                title: "View Extension",
                command: "java.project.appMod.viewExtension",
            },
            {
                title: "Continue with Copilot anyway",
                command: "java.project.appMod.continueWithCopilot",
                arguments: [prompt],
            },
        ],
    };
}

function isModernizationIntent(prompt: string): boolean {
    return MODERNIZATION_PATTERNS.some((pattern) => pattern.test(prompt));
}

async function isJavaWorkspace(token?: vscode.CancellationToken): Promise<boolean> {
    const matches = await Promise.all([
        vscode.workspace.findFiles("**/pom.xml", "**/{target,build,node_modules,.git}/**", 1, token),
        vscode.workspace.findFiles("**/build.gradle", "**/{target,build,node_modules,.git}/**", 1, token),
        vscode.workspace.findFiles("**/build.gradle.kts", "**/{target,build,node_modules,.git}/**", 1, token),
        vscode.workspace.findFiles("**/.classpath", "**/{target,build,node_modules,.git}/**", 1, token),
        vscode.workspace.findFiles("**/*.java", "**/{target,build,node_modules,.git}/**", 1, token),
    ]);

    return matches.some((result) => result.length > 0);
}

function stripMarkdown(markdown: string): string {
    return markdown
        .replace(/\*\*/g, "")
        .replace(/\n\n/g, " ")
        .trim();
}

async function enableChatRecommendations(
    context: vscode.ExtensionContext,
    options: { silent?: boolean } = {},
): Promise<void> {
    const hookFolder = getUserHookFolder(context);
    const hookRoot = getUserHookRoot(context);
    const hookScript = vscode.Uri.joinPath(hookFolder, "appmod-recommendation.js");
    const hookPowerShellScript = vscode.Uri.joinPath(hookFolder, "appmod-recommendation.ps1");
    const hookConfig = vscode.Uri.joinPath(hookRoot, COPILOT_USER_HOOK_CONFIG_FILE);

    const hookConfigContent = getHookConfig(hookScript.fsPath, hookPowerShellScript.fsPath);
    await vscode.workspace.fs.createDirectory(hookRoot);
    await vscode.workspace.fs.createDirectory(hookFolder);
    await writeFileIfChanged(hookScript, getHookScript());
    await writeFileIfChanged(hookPowerShellScript, getHookPowerShellScript());
    await writeFileIfChanged(hookConfig, hookConfigContent);

    const hookRootPath = getHookLocationSettingPath(hookRoot.fsPath);
    const configuration = vscode.workspace.getConfiguration();
    const hookLocations = { ...(configuration.get<Record<string, boolean>>(HOOK_LOCATIONS_SETTING) ?? {}) };
    if (hookLocations[hookRootPath] !== true) {
        hookLocations[hookRootPath] = true;
        await configuration.update(HOOK_LOCATIONS_SETTING, hookLocations, vscode.ConfigurationTarget.Global);
    }
    startHookRecommendationListener(context);
    if (!options.silent) {
        await vscode.window.showInformationMessage("App Modernization chat recommendations are enabled.");
    }
}

async function disableChatRecommendations(context: vscode.ExtensionContext): Promise<void> {
    const hookFolder = getUserHookFolder(context);
    const hookRoot = getUserHookRoot(context);
    const hookConfig = vscode.Uri.joinPath(getUserHookRoot(context), COPILOT_USER_HOOK_CONFIG_FILE);
    const hookFolderPath = getHookLocationSettingPath(hookFolder.fsPath);
    const hookRootPath = getHookLocationSettingPath(hookRoot.fsPath);
    const hookFolderPathWindows = getHookLocationSettingPath(hookFolder.fsPath, "\\");
    const hookRootPathWindows = getHookLocationSettingPath(hookRoot.fsPath, "\\");
    const configuration = vscode.workspace.getConfiguration();
    const hookLocations = { ...(configuration.get<Record<string, boolean>>(HOOK_LOCATIONS_SETTING) ?? {}) };

    delete hookLocations[hookRootPath];
    delete hookLocations[hookRootPathWindows];
    delete hookLocations[hookRoot.fsPath];
    delete hookLocations[hookFolderPath];
    delete hookLocations[hookFolderPathWindows];
    delete hookLocations[hookFolder.fsPath];
    await configuration.update(HOOK_LOCATIONS_SETTING, hookLocations, vscode.ConfigurationTarget.Global);

    if (await uriExists(hookFolder)) {
        await vscode.workspace.fs.delete(hookFolder, { recursive: true, useTrash: false });
    }
    if (await uriExists(hookConfig)) {
        await vscode.workspace.fs.delete(hookConfig, { useTrash: false });
    }

    await vscode.window.showInformationMessage("App Modernization chat recommendations are disabled.");
}

async function deleteHookState(context: vscode.ExtensionContext): Promise<void> {
    const hookState = vscode.Uri.joinPath(getUserHookFolder(context), "appmod-recommendation-state.json");
    if (await uriExists(hookState)) {
        await vscode.workspace.fs.delete(hookState, { useTrash: false });
    }
}

async function showChatRecommendationStatus(context: vscode.ExtensionContext): Promise<void> {
    const hookFolder = getUserHookFolder(context);
    const hookRoot = getUserHookRoot(context);
    const hookConfig = vscode.Uri.joinPath(hookRoot, COPILOT_USER_HOOK_CONFIG_FILE);
    const hookScript = vscode.Uri.joinPath(hookFolder, "appmod-recommendation.js");
    const hookPowerShellScript = vscode.Uri.joinPath(hookFolder, "appmod-recommendation.ps1");
    const hookState = vscode.Uri.joinPath(hookFolder, "appmod-recommendation-state.json");
    const hookLog = vscode.Uri.joinPath(hookFolder, "appmod-recommendation-debug.log");
    const hookEvent = vscode.Uri.joinPath(hookFolder, HOOK_RECOMMENDATION_EVENT_FILE);
    const listenerLog = vscode.Uri.joinPath(hookFolder, LISTENER_DEBUG_LOG_FILE);
    const configuration = vscode.workspace.getConfiguration();
    const hookLocations = configuration.get<Record<string, boolean>>(HOOK_LOCATIONS_SETTING) ?? {};
    const hookRootPath = getHookLocationSettingPath(hookRoot.fsPath);
    const hookRootPathWindows = getHookLocationSettingPath(hookRoot.fsPath, "\\");
    const isRegistered = hookLocations[hookRootPath] === true
        || hookLocations[hookRootPathWindows] === true
        || hookLocations[hookRoot.fsPath] === true;
    const configExists = await uriExists(hookConfig);
    const scriptExists = await uriExists(hookScript);
    const powerShellScriptExists = await uriExists(hookPowerShellScript);
    const stateExists = await uriExists(hookState);
    const logExists = await uriExists(hookLog);
    const eventExists = await uriExists(hookEvent);
    const listenerLogExists = await uriExists(listenerLog);

    await vscode.window.showInformationMessage(
        [
            `registered=${isRegistered}`,
            `config=${configExists}`,
            `script=${scriptExists}`,
            `ps1=${powerShellScriptExists}`,
            `stateFile=${stateExists}`,
            `log=${logExists}`,
            `event=${eventExists}`,
            `listenerLog=${listenerLogExists}`,
            `path=${hookRootPath}`,
        ].join(" | "),
    );
}

function startHookRecommendationListener(context: vscode.ExtensionContext): void {
    if (hookRecommendationListenerStarted) {
        return;
    }
    hookRecommendationListenerStarted = true;

    let lastRecommendationId: string | undefined;
    const poller = setInterval(async () => {
        const shownRecommendationId = await readAndShowHookRecommendation(context, lastRecommendationId);
        if (shownRecommendationId) {
            lastRecommendationId = shownRecommendationId;
        }
    }, 3000);
    context.subscriptions.push({
        dispose: () => {
            clearInterval(poller);
            hookRecommendationListenerStarted = false;
        },
    });
}

async function readAndShowHookRecommendation(
    context: vscode.ExtensionContext,
    lastRecommendationId: string | undefined,
): Promise<string | undefined> {
    const hookEventPath = path.join(getUserHookFolder(context).fsPath, HOOK_RECOMMENDATION_EVENT_FILE);

    try {
        if (!fs.existsSync(hookEventPath)) {
            return undefined;
        }

        const event = parseRecommendationEvent(fs.readFileSync(hookEventPath, "utf8"));
        const recommendationId = getRecommendationId(event);
        if (!recommendationId || recommendationId === lastRecommendationId) {
            return undefined;
        }

        await appendListenerDebugLog(context, `showing recommendation ${recommendationId}`);
        await showHookRecommendation(event);
        return recommendationId;
    } catch (error) {
        await appendListenerDebugLog(context, `error ${error instanceof Error ? error.message : String(error)}`);
        console.warn("Failed to read App Modernization recommendation event.", error);
        return undefined;
    }
}

async function showHookRecommendation(event: AppModRecommendationEvent): Promise<void> {
    const message = event.message
        ?? "This looks like a Java upgrade or modernization task. GitHub Copilot App Modernization can help with guided Java/Spring upgrades, code remediation, build fixes, and validation.";
    const action = await vscode.window.showInformationMessage(
        message,
        "Install App Modernization",
        "View Extension",
    );

    if (action === "Install App Modernization") {
        await vscode.commands.executeCommand("java.project.appMod.install");
    } else if (action === "View Extension") {
        await vscode.commands.executeCommand("java.project.appMod.viewExtension");
    }
}

function parseRecommendationEvent(eventContent: string): AppModRecommendationEvent {
    return JSON.parse(eventContent.replace(/^\uFEFF/, "")) as AppModRecommendationEvent;
}

function getRecommendationId(event: AppModRecommendationEvent): string | undefined {
    return event.id ?? `${event.cwd ?? ""}:${event.prompt ?? ""}:${event.message ?? ""}`;
}

async function appendListenerDebugLog(context: vscode.ExtensionContext, message: string): Promise<void> {
    const hookFolder = getUserHookFolder(context);
    const listenerLog = vscode.Uri.joinPath(hookFolder, LISTENER_DEBUG_LOG_FILE);
    const timestampedMessage = `${new Date().toISOString()} ${message}\n`;
    let existingLog = "";

    try {
        existingLog = Buffer.from(await vscode.workspace.fs.readFile(listenerLog)).toString("utf8");
    } catch {
        // The listener log is optional diagnostics; create it on first write.
    }

    try {
        await vscode.workspace.fs.createDirectory(hookFolder);
        await vscode.workspace.fs.writeFile(listenerLog, Buffer.from(existingLog + timestampedMessage, "utf8"));
    } catch (error) {
        console.warn("Failed to write App Modernization listener debug log.", error);
    }
}

function getHookLocationSettingPath(hookFolderPath: string, separator: "/" | "\\" = "/"): string {
    const homePath = process.env.USERPROFILE;
    if (!homePath) {
        return hookFolderPath;
    }

    const normalizedHomePath = homePath.toLowerCase();
    const normalizedHookFolderPath = hookFolderPath.toLowerCase();
    if (!normalizedHookFolderPath.startsWith(normalizedHomePath)) {
        return hookFolderPath;
    }

    return `~${hookFolderPath.substring(homePath.length).replace(/\\/g, separator)}`;
}

function getUserHookFolder(context: vscode.ExtensionContext): vscode.Uri {
    return vscode.Uri.joinPath(getUserHookRoot(context), COPILOT_USER_HOOK_SCRIPT_FOLDER);
}

function getUserHookRoot(context: vscode.ExtensionContext): vscode.Uri {
    const homePath = process.env.USERPROFILE;
    if (!homePath) {
        return vscode.Uri.joinPath(context.globalStorageUri, HOOK_FOLDER_NAME);
    }

    return vscode.Uri.file(path.join(homePath, COPILOT_USER_HOOK_ROOT));
}

async function uriExists(uri: vscode.Uri): Promise<boolean> {
    return vscode.workspace.fs.stat(uri).then(() => true, () => false);
}

async function writeFileIfChanged(uri: vscode.Uri, content: string): Promise<void> {
    const bytes = Buffer.from(content, "utf8");
    try {
        const existing = await vscode.workspace.fs.readFile(uri);
        if (Buffer.from(existing).equals(bytes)) {
            return;
        }
    } catch {
        // The file is created below when it does not already exist.
    }

    await vscode.workspace.fs.writeFile(uri, bytes);
}

function getHookConfig(scriptPath: string, powerShellScriptPath: string): string {
    return JSON.stringify({
        hooks: {
            UserPromptSubmit: [
                {
                    type: "command",
                    command: `node "${scriptPath}"`,
                    windows: `powershell -NoProfile -ExecutionPolicy Bypass -File "${powerShellScriptPath}"`,
                    cwd: ".",
                    timeout: 5,
                },
            ],
        },
    }, null, 2);
}

function getHookPowerShellScript(): string {
    return String.raw`$AppModExtensionId = "vscjava.migrate-java-to-azure"
    $LogFile = Join-Path $PSScriptRoot "appmod-recommendation-debug.log"
    $EventFile = Join-Path $PSScriptRoot "appmod-recommendation-event.json"

    function Write-DebugLog([string]$Message) {
        Add-Content -LiteralPath $LogFile -Value ("{0} {1}" -f (Get-Date).ToUniversalTime().ToString("o"), $Message) -ErrorAction SilentlyContinue
    }

    function Write-HookOutput($Value) {
        $Value | ConvertTo-Json -Compress | Write-Output
    }

function Write-RecommendationEvent([string]$Prompt, [string]$Cwd, [string]$Message) {
    $json = @{
        id = [Guid]::NewGuid().ToString()
        timestamp = (Get-Date).ToUniversalTime().ToString("o")
        extensionId = $AppModExtensionId
        prompt = $Prompt
        cwd = $Cwd
        message = $Message
    } | ConvertTo-Json -Compress
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($EventFile, $json, $utf8NoBom)
}

function Allow {
    Write-HookOutput @{ continue = $true }
}

function Test-ModernizationIntent([string]$Prompt) {
    $patterns = @(
        '\bupgrade(s|d|ing)?\b',
        '\bmoderni[sz](e|ation|ing)?\b',
        '\bmigrat(e|ion|ing)?\b',
        '\bjava\s*(8|11|17|21|25)\b',
        '\bspring\s*boot\s*(2|3)\b',
        '\bdependency\s+upgrade\b',
        '\bdependencies\s+upgrade\b'
    )

    foreach ($pattern in $patterns) {
        if ($Prompt -match $pattern) {
            return $true
        }
    }

    return $false
}

function Test-JavaWorkspace([string]$Root) {
    if ((Test-Path (Join-Path $Root "pom.xml")) -or (Test-Path (Join-Path $Root "build.gradle")) -or (Test-Path (Join-Path $Root "build.gradle.kts")) -or (Test-Path (Join-Path $Root ".classpath"))) {
        return $true
    }

    return Test-ContainsJavaFile $Root 4
}

function Test-ContainsJavaFile([string]$Directory, [int]$Depth) {
    if ($Depth -lt 0 -or -not (Test-Path $Directory)) {
        return $false
    }

    $excluded = @("node_modules", "target", "build", ".git")
    foreach ($entry in Get-ChildItem -LiteralPath $Directory -Force -ErrorAction SilentlyContinue) {
        if ($excluded -contains $entry.Name) {
            continue
        }

        if (-not $entry.PSIsContainer -and $entry.Name.EndsWith(".java")) {
            return $true
        }

        if ($entry.PSIsContainer -and (Test-ContainsJavaFile $entry.FullName ($Depth - 1))) {
            return $true
        }
    }

    return $false
}

try {
    $inputJson = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($inputJson)) {
        Write-DebugLog "allow empty-input"
        Allow
        exit 0
    }

    $event = $inputJson | ConvertFrom-Json
    $prompt = [string]$event.prompt
    $cwd = [string]$event.cwd
    if ([string]::IsNullOrWhiteSpace($cwd)) {
        $cwd = (Get-Location).Path
    }

    $hasModernizationIntent = Test-ModernizationIntent $prompt
    $hasJavaWorkspace = Test-JavaWorkspace $cwd
    Write-DebugLog "prompt='$prompt' cwd='$cwd' intent=$hasModernizationIntent java=$hasJavaWorkspace"

    if (-not $hasModernizationIntent -or -not $hasJavaWorkspace) {
        Allow
        exit 0
    }

    $recommendation = "This looks like a Java upgrade or modernization task. GitHub Copilot App Modernization can help with guided Java/Spring upgrades, code remediation, build fixes, and validation."
    Write-DebugLog "recommend appmod-recommendation"
    Write-RecommendationEvent $prompt $cwd $recommendation
    Write-HookOutput @{
        continue = $true
    }
    exit 0
} catch {
    Write-DebugLog "error $($_.Exception.Message)"
    Write-HookOutput @{
        continue = $true
        systemMessage = "App Modernization recommendation hook failed: $($_.Exception.Message)"
    }
    exit 0
}
`;
}

function getHookScript(): string {
    return String.raw`    const fs = require("fs");
    const path = require("path");

    const APP_MOD_EXTENSION_ID = "vscjava.migrate-java-to-azure";
    const EVENT_FILE = path.join(__dirname, "appmod-recommendation-event.json");

    let input = "";
process.stdin.on("data", (chunk) => {
  input += chunk;
});

process.stdin.on("end", () => {
  try {
    const event = JSON.parse(input || "{}");
    const prompt = String(event.prompt || "");
    const cwd = event.cwd || process.cwd();

    if (!isModernizationIntent(prompt)) {
      allow();
      return;
    }

    if (!isJavaWorkspace(cwd)) {
      allow();
      return;
    }

    const recommendation =
      "This looks like a Java upgrade or modernization task. " +
      "GitHub Copilot App Modernization can help with guided Java/Spring upgrades, " +
      "code remediation, build fixes, and validation.";
    writeRecommendationEvent(prompt, cwd, recommendation);
    console.log(JSON.stringify({
      continue: true
    }));
  } catch (error) {
    console.log(JSON.stringify({
      continue: true,
      systemMessage: "App Modernization recommendation hook failed: " + error.message
    }));
  }
});

function allow() {
  console.log(JSON.stringify({ continue: true }));
}

function writeRecommendationEvent(prompt, cwd, message) {
  fs.writeFileSync(EVENT_FILE, JSON.stringify({
    id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2),
    timestamp: new Date().toISOString(),
    extensionId: APP_MOD_EXTENSION_ID,
    prompt,
    cwd,
    message
  }));
}

function isModernizationIntent(prompt) {
  return [
    /\bupgrade(s|d|ing)?\b/i,
    /\bmoderni[sz](e|ation|ing)?\b/i,
    /\bmigrat(e|ion|ing)?\b/i,
    /\bjava\s*(8|11|17|21|25)\b/i,
    /\bspring\s*boot\s*(2|3)\b/i,
    /\bdependency\s+upgrade\b/i,
    /\bdependencies\s+upgrade\b/i
  ].some((pattern) => pattern.test(prompt));
}

function isJavaWorkspace(root) {
  return fileExists(root, "pom.xml") ||
    fileExists(root, "build.gradle") ||
    fileExists(root, "build.gradle.kts") ||
    fileExists(root, ".classpath") ||
    containsJavaFile(root, 4);
}

function fileExists(root, relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function containsJavaFile(dir, depth) {
  if (depth < 0 || !fs.existsSync(dir)) {
    return false;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "target", "build", ".git"].includes(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isFile() && entry.name.endsWith(".java")) {
      return true;
    }

    if (entry.isDirectory() && containsJavaFile(fullPath, depth - 1)) {
      return true;
    }
  }

  return false;
}

`;
}