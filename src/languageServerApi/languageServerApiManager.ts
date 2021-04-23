// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, Event, Extension, extensions, Uri } from "vscode";
import { Commands } from "../commands";
import { contextManager } from "../contextManager";
import { LanguageServerMode } from "./LanguageServerMode";

class LanguageServerApiManager {
    private serverMode: LanguageServerMode | null | undefined = null;

    public async isStandardServerReady(): Promise<boolean> {
        await this.checkServerMode();
        // undefined serverMode indicates an older version language server
        if (this.serverMode === undefined) {
            return true;
        }

        if (this.serverMode !== LanguageServerMode.Standard) {
            return false;
        }

        return true;
    }

    public async isLightWeightMode(): Promise<boolean> {
        await this.checkServerMode();
        return this.serverMode === LanguageServerMode.LightWeight;
    }

    public async awaitSwitchingServerFinished(): Promise<void> {
        await this.checkServerMode();
        if (this.serverMode === LanguageServerMode.Hybrid) {
            await new Promise<void>((resolve: () => void): void => {
                extensions.getExtension("redhat.java")!.exports.onDidServerModeChange(resolve);
            });
        }
    }

    private async checkServerMode(): Promise<void> {
        if (this.serverMode === null) {
            await this.initializeJavaLanguageServerApi();
        }
    }

    private async initializeJavaLanguageServerApi(): Promise<void> {
        if (this.serverMode !== null) {
            return;
        }
        const extension: Extension<any> | undefined = extensions.getExtension("redhat.java");
        if (extension) {
            await extension.activate();
            const extensionApi: any = extension.exports;
            if (!extensionApi) {
                return;
            }

            this.serverMode = extensionApi.serverMode;

            if (extensionApi.onDidClasspathUpdate) {
                const onDidClasspathUpdate: Event<Uri> = extensionApi.onDidClasspathUpdate;
                contextManager.context.subscriptions.push(onDidClasspathUpdate(async () => {
                    await commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH, /* debounce = */true);
                }));
            }

            if (extensionApi.onDidServerModeChange) {
                const onDidServerModeChange: Event<string> = extensionApi.onDidServerModeChange;
                contextManager.context.subscriptions.push(onDidServerModeChange(async (mode: LanguageServerMode) => {
                    if (this.serverMode !== mode) {
                        let needRefresh: boolean = true;
                        if (this.serverMode === "Hybrid") {
                            // Explorer will await when JLS is in Hybrid mode (activating),
                            needRefresh = false;
                        }
                        this.serverMode = mode;
                        if (needRefresh) {
                            commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH, /* debounce = */false);
                        }
                    }
                }));
            }

            if (extensionApi.onDidProjectsImport) {
                const onDidProjectsImport: Event<Uri[]> = extensionApi.onDidProjectsImport;
                contextManager.context.subscriptions.push(onDidProjectsImport(async () => {
                    commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH, /* debounce = */true);
                }));
            }
        }
    }
}

export const languageServerApiManager: LanguageServerApiManager = new LanguageServerApiManager();
