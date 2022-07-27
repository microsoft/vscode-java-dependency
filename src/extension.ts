// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import { commands, Diagnostic, Extension, ExtensionContext, extensions, languages,
    Range, tasks, TextDocument, TextEditor, Uri, window, workspace } from "vscode";
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

export async function activate(context: ExtensionContext): Promise<void> {
    contextManager.initialize(context);
    await initializeFromJsonFile(context.asAbsolutePath("./package.json"), { firstParty: true });
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
    contextManager.setContextValue(Context.EXTENSION_ACTIVATED, true);
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
