// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Event, Extension, ExtensionContext, extensions, tasks, Uri } from "vscode";
import { dispose as disposeTelemetryWrapper, initializeFromJsonFile, instrumentOperation, sendInfo } from "vscode-extension-telemetry-wrapper";
import { contextManager } from "../extension.bundle";
import { Build, Context, ExtensionName } from "./constants";
import { LibraryController } from "./controllers/libraryController";
import { ProjectController } from "./controllers/projectController";
import { init as initExpService } from "./ExperimentationService";
import { ExportJarTaskProvider } from "./exportJarSteps/ExportJarTaskProvider";
import { Settings } from "./settings";
import { syncHandler } from "./syncHandler";
import { EventCounter } from "./utility";
import { DependencyExplorer } from "./views/dependencyExplorer";

export async function activate(context: ExtensionContext): Promise<void> {
    contextManager.initialize(context);
    await initializeFromJsonFile(context.asAbsolutePath("./package.json"), { firstParty: true });
    await initExpService(context);
    await instrumentOperation("activation", activateExtension)(context);
    contextManager.setContextValue(Context.EXTENSION_ACTIVATED, true);
    contextManager.setContextValue(Context.SUPPORTED_BUILD_FILES, Build.FILE_NAMES);
}

async function activateExtension(_operationId: string, context: ExtensionContext): Promise<void> {
    context.subscriptions.push(new ProjectController(context));
    Settings.initialize(context);
    context.subscriptions.push(new LibraryController(context));
    context.subscriptions.push(DependencyExplorer.getInstance(context));
    context.subscriptions.push(contextManager);
    context.subscriptions.push(syncHandler);
    context.subscriptions.push(tasks.registerTaskProvider(ExportJarTaskProvider.exportJarType, new ExportJarTaskProvider()));

    const pollingJLS = () => {
        const javaLanguageSupport: Extension<any> | undefined = extensions.getExtension(ExtensionName.JAVA_LANGUAGE_SUPPORT);
        if (!javaLanguageSupport) {
            return;
        }

        if (javaLanguageSupport.isActive) {
            const extensionApi: any = javaLanguageSupport.exports;
            if (!extensionApi) {
                return;
            }

            if (extensionApi.onDidClasspathUpdate) {
                const onDidClasspathUpdate: Event<Uri> = extensionApi.onDidClasspathUpdate;
                context.subscriptions.push(onDidClasspathUpdate(async () => {
                    syncHandler.updateFileWatcher(Settings.autoRefresh());
                }));
            }

            if (extensionApi.serverMode === "Standard") {
                syncHandler.updateFileWatcher(Settings.autoRefresh());
            } else {
                if (extensionApi.onDidServerModeChange) {
                    const onDidServerModeChange: Event<string> = extensionApi.onDidServerModeChange;
                    context.subscriptions.push(onDidServerModeChange(async () => {
                        syncHandler.updateFileWatcher(Settings.autoRefresh());
                    }));
                }
            }
        } else {
            setTimeout(pollingJLS, 3 * 1000 /*ms*/);
        }
    };
    pollingJLS();
}

// this method is called when your extension is deactivated
export async function deactivate(): Promise<void> {
    sendInfo("", EventCounter.dict);
    await disposeTelemetryWrapper();
}
