// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, Extension, ExtensionContext, extensions } from "vscode";
import { dispose as disposeTelemetryWrapper, initializeFromJsonFile, instrumentOperation } from "vscode-extension-telemetry-wrapper";
import { LibraryController } from "./controllers/libraryController";
import { ProjectController } from "./controllers/projectController";
import { Settings } from "./settings";
import { DependencyExplorer } from "./views/dependencyExplorer";

export async function activate(context: ExtensionContext): Promise<any> {
    await initializeFromJsonFile(context.asAbsolutePath("./package.json"));
    return instrumentOperation("activation", activateExtension)(context);
}

function activateExtension(operationId: string, context: ExtensionContext) {
    commands.executeCommand("setContext", "extensionActivated", true);

    Settings.initialize(context);

    setMavenEnabledContext();

    context.subscriptions.push(new ProjectController(context));
    context.subscriptions.push(new LibraryController(context));
    context.subscriptions.push(new DependencyExplorer(context));
}

// determine if the add dependency shortcut will show or not
function setMavenEnabledContext() {
    const mavenExt: Extension<any> | undefined = extensions.getExtension("vscjava.vscode-maven");
    if (mavenExt) {
        commands.executeCommand("setContext", "mavenEnabled", true);
    }
}

// this method is called when your extension is deactivated
export async function deactivate() {
    await disposeTelemetryWrapper();
}
