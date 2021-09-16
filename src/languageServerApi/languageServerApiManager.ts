// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, Disposable, Event, Extension, extensions, Uri } from "vscode";
import { Commands } from "../commands";
import { Context, ExtensionName } from "../constants";
import { contextManager } from "../contextManager";
import { Settings } from "../settings";
import { syncHandler } from "../syncHandler";
import { LanguageServerMode } from "./LanguageServerMode";

class LanguageServerApiManager implements Disposable {
    /**
     * undefined means a legacy version language server
     * null means the JDT.LS is not activated
     */
    private serverMode: LanguageServerMode | null | undefined = null;

    private extensionChangeListener: Disposable;

    public async ready(): Promise<boolean> {
        await this.checkServerMode();

        if (this.serverMode === null || this.serverMode === LanguageServerMode.LightWeight) {
            return false;
        }

        if (this.serverMode === LanguageServerMode.Hybrid) {
            await new Promise<void>((resolve: () => void): void => {
                extensions.getExtension("redhat.java")!.exports.onDidServerModeChange(resolve);
            });
        }

        return true;
    }

    public async initializeJavaLanguageServerApi(forceActivate: boolean = true): Promise<void> {
        if (this.isLanguageServerActivated()) {
            return;
        }

        if (!this.extensionChangeListener) {
            this.extensionChangeListener = extensions.onDidChange(() => {
                if (this.serverMode === null) {
                    commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH, /* debounce = */false);
                }
            });
        }

        const extension: Extension<any> | undefined = extensions.getExtension(ExtensionName.JAVA_LANGUAGE_SUPPORT);
        if (extension) {
            contextManager.setContextValue(Context.LANGUAGE_SUPPORT_INSTALLED, true);
            if (!forceActivate) {
                return;
            }
            await extension.activate();
            const extensionApi: any = extension.exports;
            if (!extensionApi) {
                return;
            }

            this.serverMode = extensionApi.serverMode;
            if (this.serverMode === LanguageServerMode.Standard) {
                syncHandler.updateFileWatcher(Settings.autoRefresh());
            }

            if (extensionApi.onDidClasspathUpdate) {
                const onDidClasspathUpdate: Event<Uri> = extensionApi.onDidClasspathUpdate;
                contextManager.context.subscriptions.push(onDidClasspathUpdate(() => {
                    commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH, /* debounce = */true);
                    syncHandler.updateFileWatcher(Settings.autoRefresh());
                }));
            }

            if (extensionApi.onDidServerModeChange) {
                const onDidServerModeChange: Event<string> = extensionApi.onDidServerModeChange;
                contextManager.context.subscriptions.push(onDidServerModeChange((mode: LanguageServerMode) => {
                    if (this.serverMode !== mode) {
                        if (mode === LanguageServerMode.Hybrid) {
                            commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH, /* debounce = */false);
                        } else if (mode === LanguageServerMode.Standard) {
                            syncHandler.updateFileWatcher(Settings.autoRefresh());
                        }
                        this.serverMode = mode;
                    }
                }));
            }

            if (extensionApi.onDidProjectsImport) {
                const onDidProjectsImport: Event<Uri[]> = extensionApi.onDidProjectsImport;
                contextManager.context.subscriptions.push(onDidProjectsImport(() => {
                    commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH, /* debounce = */true);
                    syncHandler.updateFileWatcher(Settings.autoRefresh());
                }));
            }
        }
    }

    public dispose() {
        this.extensionChangeListener.dispose();
    }

    private isLanguageServerActivated(): boolean {
        return this.serverMode !== null;
    }

    private async checkServerMode(): Promise<void> {
        if (!this.isLanguageServerActivated()) {
            await this.initializeJavaLanguageServerApi();
        }
    }
}

export const languageServerApiManager: LanguageServerApiManager = new LanguageServerApiManager();
