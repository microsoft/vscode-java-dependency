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
import { newJavaFile } from "./explorerCommands/new";
import upgradeManager from "./upgrade/upgradeManager";
import { registerCopilotContextProviders } from "./copilot/contextProvider";
import { Jdtls, IDependencyInfo } from "./java/jdtls";

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
    contextManager.setContextValue(Context.EXTENSION_ACTIVATED, true);
    await registerCopilotContextProviders(context);
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
    
    // Register command to show project dependencies
    context.subscriptions.push(instrumentOperationAsVsCodeCommand(
        Commands.JAVA_PROJECT_SHOW_DEPENDENCIES, async (uri?: Uri) => {
            try {
                let projectUri: string;
                
                if (uri) {
                    // If URI is provided, use it
                    projectUri = uri.toString();
                } else {
                    // Otherwise, use the first workspace folder
                    const workspaceFolders = workspace.workspaceFolders;
                    if (!workspaceFolders || workspaceFolders.length === 0) {
                        window.showErrorMessage("No workspace folder found. Please open a Java project.");
                        return;
                    }
                    projectUri = workspaceFolders[0].uri.toString();
                }
                
                // Call the Java command to get dependencies
                const start = performance.now();
                const dependencies: IDependencyInfo[] = await Jdtls.getProjectDependencies(projectUri);
                const end = performance.now();
                
                if (!dependencies || dependencies.length === 0) {
                    window.showInformationMessage("No dependency information found for this project.");
                    return;
                }
                
                // Create output channel to display results
                const outputChannel = window.createOutputChannel("Java Project Dependencies");
                outputChannel.clear();
                outputChannel.appendLine("=".repeat(80));
                outputChannel.appendLine("Java Project Dependencies Information");
                outputChannel.appendLine("=".repeat(80));
                outputChannel.appendLine(`Time span: ${end - start}ms`);
                
                // Group dependencies by category
                const basicInfo: IDependencyInfo[] = [];
                const javaInfo: IDependencyInfo[] = [];
                const libraries: IDependencyInfo[] = [];
                const projectRefs: IDependencyInfo[] = [];
                const others: IDependencyInfo[] = [];
                
                for (const dep of dependencies) {
                    if (dep.key === "projectName" || dep.key === "projectLocation") {
                        basicInfo.push(dep);
                    } else if (dep.key.includes("java") || dep.key.includes("jre") || 
                               dep.key.includes("Compatibility") || dep.key === "buildTool" || 
                               dep.key === "moduleName") {
                        javaInfo.push(dep);
                    } else if (dep.key.startsWith("library_")) {
                        libraries.push(dep);
                    } else if (dep.key.startsWith("projectReference_")) {
                        projectRefs.push(dep);
                    } else {
                        others.push(dep);
                    }
                }
                
                // Display basic information
                if (basicInfo.length > 0) {
                    outputChannel.appendLine("📦 Basic Information:");
                    outputChannel.appendLine("-".repeat(80));
                    for (const dep of basicInfo) {
                        outputChannel.appendLine(`  ${dep.key}: ${dep.value}`);
                    }
                    outputChannel.appendLine("");
                }
                
                // Display Java/JDK information
                if (javaInfo.length > 0) {
                    outputChannel.appendLine("☕ Java/JDK Information:");
                    outputChannel.appendLine("-".repeat(80));
                    for (const dep of javaInfo) {
                        outputChannel.appendLine(`  ${dep.key}: ${dep.value}`);
                    }
                    outputChannel.appendLine("");
                }
                
                // Display libraries
                if (libraries.length > 0) {
                    outputChannel.appendLine("📚 Dependencies Libraries:");
                    outputChannel.appendLine("-".repeat(80));
                    for (const dep of libraries) {
                        outputChannel.appendLine(`  ${dep.value}`);
                    }
                    outputChannel.appendLine("");
                }
                
                // Display project references
                if (projectRefs.length > 0) {
                    outputChannel.appendLine("🔗 Project References:");
                    outputChannel.appendLine("-".repeat(80));
                    for (const dep of projectRefs) {
                        outputChannel.appendLine(`  ${dep.value}`);
                    }
                    outputChannel.appendLine("");
                }
                
                // Display other information
                if (others.length > 0) {
                    outputChannel.appendLine("ℹ️  Other Information:");
                    outputChannel.appendLine("-".repeat(80));
                    for (const dep of others) {
                        outputChannel.appendLine(`  ${dep.key}: ${dep.value}`);
                    }
                    outputChannel.appendLine("");
                }
                
                outputChannel.appendLine("=".repeat(80));
                outputChannel.appendLine(`Total entries: ${dependencies.length}`);
                outputChannel.appendLine("=".repeat(80));
                
                // Show the output channel
                outputChannel.show();
                
                window.showInformationMessage(
                    `Successfully retrieved ${dependencies.length} dependency entries. Check the Output panel.`
                );
                
            } catch (error) {
                window.showErrorMessage(`Failed to get project dependencies: ${error}`);
            }
        }
    ));
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
