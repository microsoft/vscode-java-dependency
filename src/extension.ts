// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, Extension, ExtensionContext, extensions, tasks, Uri, workspace } from "vscode";
import { dispose as disposeTelemetryWrapper, initializeFromJsonFile, instrumentOperation, sendInfo } from "vscode-extension-telemetry-wrapper";
import { Commands, contextManager } from "../extension.bundle";
import { Context, ExtensionName } from "./constants";
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
    context.subscriptions.push(tasks.registerTaskProvider(ExportJarTaskProvider.exportJarType, new ExportJarTaskProvider()));
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
