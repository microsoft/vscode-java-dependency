// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, ConfigurationChangeEvent, ExtensionContext, workspace, WorkspaceConfiguration } from "vscode";
import { instrumentOperation } from "vscode-extension-telemetry-wrapper";
import { Commands } from "./commands";

export class Settings {

    public static initialize(context: ExtensionContext): void {
        context.subscriptions.push(workspace.onDidChangeConfiguration((e: ConfigurationChangeEvent) => {
            if (!e.affectsConfiguration("java.dependency")) {
                return;
            }
            const updatedConfig = workspace.getConfiguration("java.dependency");
            if (updatedConfig.showOutline !== this._dependencyConfig.showOutline
                || updatedConfig.packagePresentation !== this._dependencyConfig.packagePresentation
                || (updatedConfig.syncWithFolderExplorer !== this._dependencyConfig.syncWithFolderExplorer
                    && updatedConfig.syncWithFolderExplorer)) {
                commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH);
            }
            this._dependencyConfig = updatedConfig;

        }));

        context.subscriptions.push(commands.registerCommand(Commands.VIEW_PACKAGE_SYNCWITHFOLDER,
            instrumentOperation(Commands.VIEW_PACKAGE_SYNCWITHFOLDER, Settings.syncWithFolderCommand)));

        context.subscriptions.push(commands.registerCommand(Commands.VIEW_PACKAGE_CHANGEREPRESENTATION,
            instrumentOperation(Commands.VIEW_PACKAGE_CHANGEREPRESENTATION, Settings.changePackageRepresentation)));

        context.subscriptions.push(commands.registerCommand(Commands.VIEW_PACKAGE_CHANGETOFLATPACKAGEVIEW,
            instrumentOperation(Commands.VIEW_PACKAGE_CHANGETOFLATPACKAGEVIEW, Settings.changeToFlatPackageView)));

        context.subscriptions.push(commands.registerCommand(Commands.VIEW_PACKAGE_CHANGETOHIERARCHICALPACKAGEVIEW,
            instrumentOperation(Commands.VIEW_PACKAGE_CHANGETOHIERARCHICALPACKAGEVIEW, Settings.changeToHierarchicalPackageView)));
    }

    public static syncWithFolderCommand(): void {
        const syncWithFolder = Settings.syncWithFolderExplorer();
        workspace.getConfiguration().update("java.dependency.syncWithFolderExplorer", !syncWithFolder, false);
    }

    public static changeToFlatPackageView(): void {
        workspace.getConfiguration().update("java.dependency.packagePresentation", PackagePresentation.Flat, false);
    }

    public static changeToHierarchicalPackageView(): void {
        workspace.getConfiguration().update("java.dependency.packagePresentation", PackagePresentation.Hierarchical, false);
    }

    public static changePackageRepresentation(): void {
        const representationSetting = Settings.isHierarchicalView() ? PackagePresentation.Flat : PackagePresentation.Hierarchical;
        workspace.getConfiguration().update("java.dependency.packagePresentation", representationSetting, false);
    }

    public static showOutline(): boolean {
        return this._dependencyConfig.get("showOutline");
    }

    public static syncWithFolderExplorer(): boolean {
        return this._dependencyConfig.get("syncWithFolderExplorer");
    }

    public static isHierarchicalView(): boolean {
        return this._dependencyConfig.get("packagePresentation") === PackagePresentation.Hierarchical;
    }

    private static _dependencyConfig: WorkspaceConfiguration = workspace.getConfiguration("java.dependency");
}

enum PackagePresentation {
    Flat = "flat",
    Hierarchical = "hierarchical",
}
