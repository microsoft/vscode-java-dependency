// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, Event, Extension, extensions, Uri, window } from "vscode";
import { Commands } from "../commands";
import { Context, ExtensionName } from "../constants";
import { contextManager } from "../contextManager";
import { Settings } from "../settings";
import { syncHandler } from "../syncHandler";
import { LanguageServerMode } from "./LanguageServerMode";

class LanguageServerApiManager {
    private extensionApi: any;

    private isServerReady: boolean = false;

    public async ready(): Promise<boolean> {
        if (this.isServerReady) {
            return true;
        }

        if (!this.isApiInitialized()) {
            await this.initializeJavaLanguageServerApis();
        }

        const serverMode: LanguageServerMode | undefined = this.extensionApi?.serverMode;
        if (!serverMode || serverMode === LanguageServerMode.LightWeight) {
            return false;
        }

        await this.extensionApi.serverReady();
        this.isServerReady = true;
        return true;
    }

    public async initializeJavaLanguageServerApis(): Promise<void> {
        if (this.isApiInitialized()) {
            return;
        }

        const extension: Extension<any> | undefined = extensions.getExtension(ExtensionName.JAVA_LANGUAGE_SUPPORT);
        if (extension) {
            contextManager.setContextValue(Context.LANGUAGE_SUPPORT_INSTALLED, true);
            await extension.activate();
            const extensionApi: any = extension.exports;
            if (!extensionApi) {
                window.showErrorMessage("Please update 'redhat.java' to the latest version.");
                return;
            }

            this.extensionApi = extensionApi;
            if (extensionApi.onDidClasspathUpdate) {
                const onDidClasspathUpdate: Event<Uri> = extensionApi.onDidClasspathUpdate;
                contextManager.context.subscriptions.push(onDidClasspathUpdate(() => {
                    commands.executeCommand(Commands.VIEW_PACKAGE_INTERNAL_REFRESH, /* debounce = */true);
                    syncHandler.updateFileWatcher(Settings.autoRefresh());
                }));
            }

            if (extensionApi.onDidProjectsImport) {
                const onDidProjectsImport: Event<Uri[]> = extensionApi.onDidProjectsImport;
                contextManager.context.subscriptions.push(onDidProjectsImport(() => {
                    commands.executeCommand(Commands.VIEW_PACKAGE_INTERNAL_REFRESH, /* debounce = */true);
                    syncHandler.updateFileWatcher(Settings.autoRefresh());
                }));
            }

            if (extensionApi.onDidProjectsDelete) {
                const onDidProjectsDelete: Event<Uri[]> = extensionApi.onDidProjectsDelete;
                contextManager.context.subscriptions.push(onDidProjectsDelete(() => {
                    commands.executeCommand(Commands.VIEW_PACKAGE_INTERNAL_REFRESH, /* debounce = */true);
                    syncHandler.updateFileWatcher(Settings.autoRefresh());
                }));

            }

            if (this.extensionApi?.serverMode === LanguageServerMode.LightWeight) {
                if (extensionApi.onDidServerModeChange) {
                    const onDidServerModeChange: Event<string> = extensionApi.onDidServerModeChange;
                    contextManager.context.subscriptions.push(onDidServerModeChange((mode: LanguageServerMode) => {
                        if (mode === LanguageServerMode.Hybrid) {
                            commands.executeCommand(Commands.VIEW_PACKAGE_INTERNAL_REFRESH, /* debounce = */false);
                        }
                    }));
                }
            }
        }
    }

    private isApiInitialized(): boolean {
        return this.extensionApi !== undefined;
    }

    /**
     * Check if the language server is ready in the given timeout.
     * @param timeout the timeout in milliseconds to wait
     * @returns false if the language server is not ready in the given timeout, otherwise true
     */
    public isReady(timeout: number): Promise<boolean> {
        return Promise.race([this.ready(), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeout))]);
    }
}

export const languageServerApiManager: LanguageServerApiManager = new LanguageServerApiManager();
