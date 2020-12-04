// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ExtensionContext, tasks } from "vscode";
import { dispose as disposeTelemetryWrapper, initializeFromJsonFile, instrumentOperation } from "vscode-extension-telemetry-wrapper";
import { contextManager } from "../extension.bundle";
import { Build, Context } from "./constants";
import { LibraryController } from "./controllers/libraryController";
import { ProjectController } from "./controllers/projectController";
import { init as initExpService } from "./ExperimentationService";
import { ExportJarTaskProvider } from "./exportJarSteps/ExportJarTaskProvider";
import { Settings } from "./settings";
import { syncHandler } from "./syncHandler";
import { DependencyExplorer } from "./views/dependencyExplorer";

export async function activate(context: ExtensionContext): Promise<void> {
    contextManager.initialize(context);
    await initializeFromJsonFile(context.asAbsolutePath("./package.json"), { firstParty: true });
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
    initExpService(context);
}

// this method is called when your extension is deactivated
export async function deactivate() {
    await disposeTelemetryWrapper();
}
