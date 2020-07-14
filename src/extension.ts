// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, Event, Extension, ExtensionContext, extensions, Uri } from "vscode";
import { dispose as disposeTelemetryWrapper, initializeFromJsonFile, instrumentOperation, instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { Commands } from "./commands";
import { Context } from "./constants";
import { contextManager } from "./contextManager";
import { LibraryController } from "./controllers/libraryController";
import { ProjectController } from "./controllers/projectController";
import { init as initExpService } from "./ExperimentationService";
import { Settings } from "./settings";
import { DependencyExplorer } from "./views/dependencyExplorer";

export async function activate(context: ExtensionContext): Promise<any> {
    await initializeFromJsonFile(context.asAbsolutePath("./package.json"), { firstParty: true });
    return instrumentOperation("activation", activateExtension)(context);
}

async function activateExtension(_operationId: string, context: ExtensionContext): Promise<void> {
    const extension: Extension<any> | undefined = extensions.getExtension("redhat.java");
    if (extension && extension.isActive) {
        const extensionApi: any = extension.exports;
        if (!extensionApi) {
            return;
        }

        serverMode = extensionApi.serverMode;

        if (extensionApi.onDidClasspathUpdate) {
            const onDidClasspathUpdate: Event<Uri> = extensionApi.onDidClasspathUpdate;
            context.subscriptions.push(onDidClasspathUpdate(async () => {
                await commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH, /* debounce = */true);
            }));
        }

        if (extensionApi.onDidServerModeChange) {
            const onDidServerModeChange: Event<string> = extensionApi.onDidServerModeChange;
            context.subscriptions.push(onDidServerModeChange(async (mode: string) => {
                serverMode = mode;
                commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH, /* debounce = */false);
            }));
        }

        if (extensionApi.onDidProjectsImport) {
            const onDidProjectsImport: Event<Uri[]> = extensionApi.onDidProjectsImport;
            context.subscriptions.push(onDidProjectsImport(async () => {
                commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH, /* debounce = */true);
            }));
        }
    }

    Settings.initialize(context);
    contextManager.initialize(context);
    setMavenExtensionState();

    context.subscriptions.push(new ProjectController(context));
    context.subscriptions.push(new LibraryController(context));
    context.subscriptions.push(new DependencyExplorer(context));
    context.subscriptions.push(contextManager);
    contextManager.setContextValue(Context.EXTENSION_ACTIVATED, true);

    initExpService(context);

    context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.JAVA_PROJECT_SWITCH_SERVER_MODE, async () => {
        if (isSwitchingServer()) {
            return;
        }
        await commands.executeCommand(Commands.JAVA_SWITCH_SERVER_MODE, "Standard" /*mode*/);
    }));
}

// determine if the add dependency shortcut will show or not
function setMavenExtensionState() {
    setMavenEnabledContext();
    extensions.onDidChange(() => {
        setMavenEnabledContext();
    });

    function setMavenEnabledContext() {
        const mavenExt: Extension<any> | undefined = extensions.getExtension("vscjava.vscode-maven");
        contextManager.setContextValue(Context.MAVEN_ENABLED, !!mavenExt);
    }
}

// this method is called when your extension is deactivated
export async function deactivate() {
    await disposeTelemetryWrapper();
}

export function isStandardServerReady(): boolean {
    // undefined serverMode indicates an older version language server
    if (serverMode === undefined) {
        return true;
    }

    if (serverMode !== "Standard") {
        return false;
    }

    return true;
}

export function isSwitchingServer(): boolean {
    return serverMode === "Hybrid";
}

let serverMode: string | undefined;
