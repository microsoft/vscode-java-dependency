// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import {
    commands, Diagnostic, Disposable, Extension, ExtensionContext, extensions, languages,
    Range, tasks, TextDocument, TextEditor, Uri, window, workspace
} from "vscode";
import { dispose as disposeTelemetryWrapper, initializeFromJsonFile, instrumentOperation, instrumentOperationAsVsCodeCommand, sendInfo } from "vscode-extension-telemetry-wrapper";
import { Commands, contextManager } from "../extension.bundle";
import { BuildTaskProvider } from "./tasks/build/buildTaskProvider";
import { buildFiles, Context, ExtensionName } from "./constants";
import { LibraryController } from "./controllers/libraryController";
import { ProjectController } from "./controllers/projectController";
import { init as initExpService } from "./ExperimentationService";
import { DeprecatedExportJarTaskProvider, BuildArtifactTaskProvider } from "./tasks/buildArtifact/BuildArtifactTaskProvider";
import { Settings } from "./settings";
import { syncHandler } from "./syncHandler";
import { EventCounter } from "./utility";
import { DependencyExplorer } from "./views/dependencyExplorer";
import { DiagnosticProvider } from "./tasks/buildArtifact/migration/DiagnosticProvider";
import { setContextForDeprecatedTasks, updateExportTaskType } from "./tasks/buildArtifact/migration/utils";
import { CodeActionProvider } from "./tasks/buildArtifact/migration/CodeActionProvider";
import { newJavaFile } from "./explorerCommands/new";
import upgradeManager from "./upgrade/upgradeManager";
import { registerJavaContextTools } from "./copilot/tools/javaContextTools";
import { languageServerApiManager } from "./languageServerApi/languageServerApiManager";

export async function activate(context: ExtensionContext): Promise<void> {
    contextManager.initialize(context);
    upgradeManager.initialize(context);
    await initializeFromJsonFile(context.asAbsolutePath("./package.json"));
    await initExpService(context);
    await instrumentOperation("activation", activateExtension)(context);
    addExtensionChangeListener(context);
    // the when clause does not support 'workspaceContains' we used for activation event,
    // so we manually find the target files and set it to a context value.
    workspace.findFiles("{*.gradle,*.gradle.kts,pom.xml,.classpath}", undefined, 1).then((uris: Uri[]) => {
        if (uris && uris.length) {
            contextManager.setContextValue(Context.WORKSPACE_CONTAINS_BUILD_FILES, true);
        }
    });
    await activateJavaProjectExplorerWhenJavaContentExists(context);
}

/**
 * The extension is activated by `workspaceContains:*.gradle*` as well, which fires for any
 * Gradle workspace regardless of language (Groovy/Grails/Kotlin/etc.). Showing the
 * "Java Projects" view in such workspaces is annoying for non-Java users. To avoid that,
 * we only flip the `java:projectManagerActivated` context (which controls the view's
 * visibility) when we are confident the workspace actually contains Java content:
 *   1. The active editor is a Java file (typical when activated via `onLanguage:java`).
 *   2. The workspace contains Maven/Eclipse Java metadata (`pom.xml` / `.classpath`).
 *   3. The workspace contains at least one `*.java` source file.
 * For Gradle-only workspaces without Java sources we install a watcher so the view will
 * appear automatically once a Java file is added later.
 */
async function activateJavaProjectExplorerWhenJavaContentExists(context: ExtensionContext): Promise<void> {
    let activated = false;
    const setActivated = () => {
        if (activated) {
            return;
        }
        activated = true;
        contextManager.setContextValue(Context.EXTENSION_ACTIVATED, true);
    };

    // Any already-loaded Java document (active or not) is a strong signal. This also covers
    // the case where the extension is activated by `onLanguage:java` but `activeTextEditor`
    // has not yet been populated.
    if (workspace.textDocuments.some((doc) => doc.languageId === "java")
        || window.activeTextEditor?.document.languageId === "java") {
        setActivated();
        return;
    }

    const [javaProjectMetadata, javaSources] = await Promise.all([
        workspace.findFiles("{**/pom.xml,**/.classpath}", undefined, 1),
        workspace.findFiles("**/*.java", undefined, 1),
    ]);
    if (javaProjectMetadata.length > 0 || javaSources.length > 0) {
        setActivated();
        return;
    }

    // No Java content detected yet. Listen for it to appear via any of these channels:
    //   - A `*.java` source file being created in the workspace (FileSystemWatcher).
    //   - A Java document being opened later (e.g. a single file from outside the workspace).
    const javaFileWatcher = workspace.createFileSystemWatcher("**/*.java");
    const disposables: Disposable[] = [
        javaFileWatcher,
        javaFileWatcher.onDidCreate(setActivated),
        workspace.onDidOpenTextDocument((doc) => {
            if (doc.languageId === "java") {
                setActivated();
            }
        }),
    ];
    context.subscriptions.push(...disposables);
}

async function activateExtension(_operationId: string, context: ExtensionContext): Promise<void> {
    context.subscriptions.push(new ProjectController(context));
    Settings.initialize(context);
    context.subscriptions.push(new LibraryController(context));
    context.subscriptions.push(DependencyExplorer.getInstance(context));
    context.subscriptions.push(contextManager);
    context.subscriptions.push(syncHandler);
    context.subscriptions.push(tasks.registerTaskProvider(DeprecatedExportJarTaskProvider.type, new DeprecatedExportJarTaskProvider()));
    context.subscriptions.push(tasks.registerTaskProvider(BuildArtifactTaskProvider.exportJarType, new BuildArtifactTaskProvider()));
    context.subscriptions.push(tasks.registerTaskProvider(BuildTaskProvider.type, new BuildTaskProvider()));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_MENUS_FILE_NEW_JAVA_CLASS, newJavaFile));
    context.subscriptions.push(window.onDidChangeActiveTextEditor((e: TextEditor | undefined) => {
        setContextForReloadProject(e?.document);
    }));
    context.subscriptions.push(languages.onDidChangeDiagnostics(() => {
        setContextForReloadProject(window.activeTextEditor?.document);
    }));
    instrumentOperationAsVsCodeCommand(Commands.JAVA_PROJECT_RELOAD_ACTIVE_FILE, (uri?: Uri) => {
        if (!uri) {
            const activeDocument = window.activeTextEditor?.document;
            if (!activeDocument) {
                return;
            }
            uri = activeDocument.uri;
        }

        if (!buildFiles.includes(path.basename(uri.fsPath))) {
            return;
        }

        commands.executeCommand(Commands.JAVA_PROJECT_CONFIGURATION_UPDATE, uri);
    });
    // handle deprecated tasks
    context.subscriptions.push(new DiagnosticProvider());
    context.subscriptions.push(languages.registerCodeActionsProvider([{
        scheme: "file",
        pattern: "**/.vscode/tasks.json"
    }], new CodeActionProvider()));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand(
        Commands.JAVA_UPDATE_DEPRECATED_TASK, async (document: TextDocument, range: Range) => {
            await updateExportTaskType(document, range);
        }
    ));
    setContextForDeprecatedTasks();

    // Register Copilot context providers after Java Language Server is ready.
    languageServerApiManager.ready().then((isReady) => {
        const config = workspace.getConfiguration("vscode-java-dependency");
        const isSettingEnabled = config.get<boolean>("enableLspTools", false);
        sendInfo("", {
            operationName: "lmTool.registrationCheck",
            javaLSReady: isReady ? "true" : "false",
            lspToolsEnabled: isSettingEnabled ? "true" : "false",
        });
        if (isReady && isSettingEnabled) {
            registerJavaContextTools(context);
        }
    });
}

// this method is called when your extension is deactivated
export async function deactivate(): Promise<void> {
    sendInfo("", EventCounter.dict);
    await disposeTelemetryWrapper();
}

function addExtensionChangeListener(context: ExtensionContext): void {
    const extension: Extension<any> | undefined = extensions.getExtension(ExtensionName.JAVA_LANGUAGE_SUPPORT);
    if (!extension) {
        // java language support is not installed or disabled
        const extensionChangeListener = extensions.onDidChange(() => {
            if (extensions.getExtension(ExtensionName.JAVA_LANGUAGE_SUPPORT)) {
                commands.executeCommand(Commands.VIEW_PACKAGE_INTERNAL_REFRESH, /* debounce = */false);
                extensionChangeListener.dispose();
            }
        });
        context.subscriptions.push(extensionChangeListener);
    }
}

/**
 * Set the context value when reload diagnostic is detected for the active
 * build file.
 */
function setContextForReloadProject(document: TextDocument | undefined): void {
    if (!document || !buildFiles.includes(path.basename(document.fileName))) {
        contextManager.setContextValue(Context.RELOAD_PROJECT_ACTIVE, false);
        return;
    }

    const diagnostics: Diagnostic[] = languages.getDiagnostics(document.uri);
    for (const diagnostic of diagnostics) {
        if (diagnostic.message.startsWith("The build file has been changed")) {
            contextManager.setContextValue(Context.RELOAD_PROJECT_ACTIVE, true);
            return;
        }
    }
    contextManager.setContextValue(Context.RELOAD_PROJECT_ACTIVE, false);
}
