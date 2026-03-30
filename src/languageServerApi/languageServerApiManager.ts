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
    private isServerRunning: boolean = false;
    private serverReadyWaitStarted: boolean = false;

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

        // Use serverRunning() if available (API >= 0.14) for progressive loading.
        // This resolves when the server process is alive and can handle requests,
        // even if project imports haven't completed yet. This enables the tree view
        // to show projects incrementally as they are imported.
        if (!this.isServerRunning && this.extensionApi.serverRunning) {
            await this.extensionApi.serverRunning();
            this.isServerRunning = true;
            return true;
        }
        if (this.isServerRunning) {
            return true;
        }

        // Fallback for older API versions: wait for full server readiness
        await this.extensionApi.serverReady();
        this.isServerReady = true;
        return true;
    }

    /**
     * Start a background wait for full server readiness (import complete).
     * When the server finishes importing, trigger a full refresh to replace
     * progressive placeholder items with proper data from the server.
     * Guarded so it only starts once regardless of call order.
     */
    private startServerReadyWait(): void {
        if (this.serverReadyWaitStarted || this.isServerReady) {
            return;
        }
        if (this.extensionApi?.serverReady) {
            this.serverReadyWaitStarted = true;
            this.extensionApi.serverReady()
                .then(() => {
                    this.isServerReady = true;
                    commands.executeCommand(Commands.VIEW_PACKAGE_INTERNAL_REFRESH, /* debounce = */false);
                })
                .catch((error: unknown) => {
                    console.error("Java language server failed to become ready:", error);
                });
        }
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
            // Start background wait for full server readiness unconditionally.
            // This ensures isServerReady is set and final refresh fires even
            // if onDidProjectsImport sets isServerRunning before ready() runs.
            this.startServerReadyWait();

            if (extensionApi.onDidClasspathUpdate) {
                const onDidClasspathUpdate: Event<Uri> = extensionApi.onDidClasspathUpdate;
                contextManager.context.subscriptions.push(onDidClasspathUpdate((uri: Uri) => {
                    if (this.isServerReady) {
                        // Server is fully ready — do a normal refresh to get full project data.
                        commands.executeCommand(Commands.VIEW_PACKAGE_INTERNAL_REFRESH, /* debounce = */true);
                    } else {
                        // During import, the server is blocked and can't respond to queries.
                        // Don't clear progressive items. Try to add the project if not
                        // already present (typically a no-op since ProjectsImported fires first).
                        commands.executeCommand(Commands.VIEW_PACKAGE_INTERNAL_ADD_PROJECTS, [uri.toString()]);
                    }
                    syncHandler.updateFileWatcher(Settings.autoRefresh());
                }));
            }

            if (extensionApi.onDidProjectsImport) {
                const onDidProjectsImport: Event<Uri[]> = extensionApi.onDidProjectsImport;
                contextManager.context.subscriptions.push(onDidProjectsImport((uris: Uri[]) => {
                    // Server is sending project data, so it's definitely running.
                    // Mark as running so ready() returns immediately on subsequent calls.
                    this.isServerRunning = true;
                    // During import, the JDTLS server is blocked by Eclipse workspace
                    // operations and cannot respond to queries. Instead of triggering
                    // a refresh (which queries the server), directly add projects to
                    // the tree view from the notification data.
                    const projectUris = uris.map(u => u.toString());
                    commands.executeCommand(Commands.VIEW_PACKAGE_INTERNAL_ADD_PROJECTS, projectUris);
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
     * Returns true if the server has fully completed initialization (import finished).
     * During progressive loading, this returns false even though ready() has resolved.
     */
    public isFullyReady(): boolean {
        return this.isServerReady;
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
