// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ExtensionContext, tasks, Uri, workspace } from "vscode";
import { dispose as disposeTelemetryWrapper, initializeFromJsonFile, instrumentOperation, sendInfo } from "vscode-extension-telemetry-wrapper";
import { contextManager } from "../extension.bundle";
import { Context } from "./constants";
import { LibraryController } from "./controllers/libraryController";
import { ProjectController } from "./controllers/projectController";
import { init as initExpService } from "./ExperimentationService";
import { ExportJarTaskProvider } from "./exportJarSteps/ExportJarTaskProvider";
import { languageServerApiManager } from "./languageServerApi/languageServerApiManager";
import { Settings } from "./settings";
import { syncHandler } from "./syncHandler";
import { EventCounter } from "./utility";
import { DependencyExplorer } from "./views/dependencyExplorer";

export async function activate(context: ExtensionContext): Promise<void> {
    contextManager.initialize(context);
    await initializeFromJsonFile(context.asAbsolutePath("./package.json"), { firstParty: true });
    await initExpService(context);
    await instrumentOperation("activation", activateExtension)(context);
    languageServerApiManager.initializeJavaLanguageServerApi(false);
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
    context.subscriptions.push(languageServerApiManager);
    context.subscriptions.push(new ProjectController(context));
    Settings.initialize(context);
    context.subscriptions.push(new LibraryController(context));
    context.subscriptions.push(DependencyExplorer.getInstance(context));
    context.subscriptions.push(contextManager);
    context.subscriptions.push(syncHandler);
    context.subscriptions.push(tasks.registerTaskProvider(ExportJarTaskProvider.exportJarType, new ExportJarTaskProvider()));
}

// this method is called when your extension is deactivated
export async function deactivate(): Promise<void> {
    sendInfo("", EventCounter.dict);
    await disposeTelemetryWrapper();
}
