// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import {
    commands, ConfigurationChangeEvent, Disposable, DocumentHighlight, ExtensionContext,
    window, workspace, WorkspaceConfiguration,
} from "vscode";
import { instrumentOperation } from "vscode-extension-telemetry-wrapper";
import { Commands } from "./commands";
import { SyncHandler } from "./fileWather";

export class Settings {

    public static initialize(context: ExtensionContext): void {
        context.subscriptions.push(workspace.onDidChangeConfiguration((e: ConfigurationChangeEvent) => {
            if (!e.affectsConfiguration("java.dependency")) {
                return;
            }
            const oldConfig = this._dependencyConfig;
            const updatedConfig = workspace.getConfiguration("java.dependency");
            this._dependencyConfig = updatedConfig;
            for (const listener of this._configurationListeners) {
                listener(updatedConfig, oldConfig);
            }
        }));
        this.registerConfigurationListener((updatedConfig, oldConfig) => {
            if (updatedConfig.showOutline !== oldConfig.showOutline
                || updatedConfig.packagePresentation !== oldConfig.packagePresentation
                || (updatedConfig.syncWithFolderExplorer !== oldConfig.syncWithFolderExplorer
                    && updatedConfig.syncWithFolderExplorer)) {
                commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH);
            }
        });
        this.registerConfigurationListener((updatedConfig, oldConfig) => {
            if (updatedConfig.autoRefresh !== oldConfig.autoRefresh) {
                SyncHandler.updateFileWatcher(updatedConfig.autoRefresh);
            }
        });

        SyncHandler.updateFileWatcher(Settings.autoRefresh());

        context.subscriptions.push({ dispose: () => { this._configurationListeners = []; } });

        context.subscriptions.push(commands.registerCommand(Commands.VIEW_PACKAGE_LINKWITHFOLDER,
            instrumentOperation(Commands.VIEW_PACKAGE_LINKWITHFOLDER, Settings.linkWithFolderCommand)));

        context.subscriptions.push(commands.registerCommand(Commands.VIEW_PACKAGE_UNLINKWITHFOLDER,
            instrumentOperation(Commands.VIEW_PACKAGE_UNLINKWITHFOLDER, Settings.unlinkWithFolderCommand)));

        context.subscriptions.push(commands.registerCommand(Commands.VIEW_PACKAGE_CHANGETOFLATPACKAGEVIEW,
            instrumentOperation(Commands.VIEW_PACKAGE_CHANGETOFLATPACKAGEVIEW, Settings.changeToFlatPackageView)));

        context.subscriptions.push(commands.registerCommand(Commands.VIEW_PACKAGE_CHANGETOHIERARCHICALPACKAGEVIEW,
            instrumentOperation(Commands.VIEW_PACKAGE_CHANGETOHIERARCHICALPACKAGEVIEW, Settings.changeToHierarchicalPackageView)));
    }

    public static registerConfigurationListener(listener: Listener) {
        this._configurationListeners.push(listener);
    }

    public static linkWithFolderCommand(): void {
        workspace.getConfiguration().update("java.dependency.syncWithFolderExplorer", true, false);
    }

    public static unlinkWithFolderCommand(): void {
        workspace.getConfiguration().update("java.dependency.syncWithFolderExplorer", false, false);
    }

    public static changeToFlatPackageView(): void {
        workspace.getConfiguration().update("java.dependency.packagePresentation", PackagePresentation.Flat, false);
    }

    public static changeToHierarchicalPackageView(): void {
        workspace.getConfiguration().update("java.dependency.packagePresentation", PackagePresentation.Hierarchical, false);
    }

    public static showOutline(): boolean {
        return this._dependencyConfig.get("showOutline");
    }

    public static autoRefresh(): boolean {
        return this._dependencyConfig.get("autoRefresh");
    }

    public static syncWithFolderExplorer(): boolean {
        return this._dependencyConfig.get("syncWithFolderExplorer");
    }

    public static isHierarchicalView(): boolean {
        return this._dependencyConfig.get("packagePresentation") === PackagePresentation.Hierarchical;
    }

    public static refreshDelay(): number {
        return this._dependencyConfig.get("refreshDelay");
    }

    private static _dependencyConfig: WorkspaceConfiguration = workspace.getConfiguration("java.dependency");

    private static _configurationListeners: Listener[] = [];
}

enum PackagePresentation {
    Flat = "flat",
    Hierarchical = "hierarchical",
}

type Listener = (updatedConfig: WorkspaceConfiguration, oldConfig: WorkspaceConfiguration) => void;
