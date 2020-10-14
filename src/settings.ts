// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import {
    commands, ConfigurationChangeEvent, ExtensionContext,
    workspace, WorkspaceConfiguration,
} from "vscode";
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { Commands } from "./commands";
import { syncHandler } from "./syncHandler";

export class Settings {

    public static initialize(context: ExtensionContext): void {
        context.subscriptions.push(workspace.onDidChangeConfiguration((e: ConfigurationChangeEvent) => {
            if (!e.affectsConfiguration("java.dependency")) {
                return;
            }
            const oldConfig = this._dependencyConfig;
            this._dependencyConfig = workspace.getConfiguration("java.dependency");
            for (const listener of this._configurationListeners) {
                listener(this._dependencyConfig, oldConfig);
            }
        }));
        this.registerConfigurationListener((updatedConfig, oldConfig) => {
            if (updatedConfig.showMembers !== oldConfig.showMembers
                || updatedConfig.packagePresentation !== oldConfig.packagePresentation
                || (updatedConfig.syncWithFolderExplorer !== oldConfig.syncWithFolderExplorer
                    && updatedConfig.syncWithFolderExplorer)) {
                commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH);
            } else if (updatedConfig.autoRefresh !== oldConfig.autoRefresh) {
                syncHandler.updateFileWatcher(updatedConfig.autoRefresh);
            }
        });

        syncHandler.updateFileWatcher(Settings.autoRefresh());

        context.subscriptions.push({ dispose: () => { this._configurationListeners = []; } });

        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_LINKWITHFOLDER, Settings.linkWithFolderCommand));

        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_UNLINKWITHFOLDER, Settings.unlinkWithFolderCommand));

        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_CHANGETOFLATPACKAGEVIEW,
            Settings.changeToFlatPackageView));

        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_CHANGETOHIERARCHICALPACKAGEVIEW,
            Settings.changeToHierarchicalPackageView));
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

    public static updateReferencedLibraries(libraries: IReferencedLibraries): void {
        let updateSetting: string[] | Partial<IReferencedLibraries> = {
            include: libraries.include,
            exclude: libraries.exclude.length > 0 ? libraries.exclude : undefined,
            sources: Object.keys(libraries.sources).length > 0 ? libraries.sources : undefined,
        };
        if (!updateSetting.exclude && !updateSetting.sources) {
            updateSetting = libraries.include;
        }
        workspace.getConfiguration().update("java.project.referencedLibraries", updateSetting);
    }

    public static referencedLibraries(): IReferencedLibraries {
        const setting = workspace.getConfiguration("java.project").get<string[] | Partial<IReferencedLibraries>>("referencedLibraries");
        const defaultSetting: IReferencedLibraries = { include: [], exclude: [], sources: {} };
        if (Array.isArray(setting)) {
            return { ...defaultSetting, include: setting };
        } else {
            return { ...defaultSetting, ...setting };
        }
    }

    public static showMembers(): boolean {
        return this._dependencyConfig.get("showMembers");
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

    public static getExportJarTargetPath(): string {
        // tslint:disable-next-line: no-invalid-template-strings
        return workspace.getConfiguration("java.project.exportJar").get<string>("targetPath", "${workspaceFolder}/${workspaceFolderBasename}.jar");
    }

    private static _dependencyConfig: WorkspaceConfiguration = workspace.getConfiguration("java.dependency");

    private static _configurationListeners: Listener[] = [];
}

enum PackagePresentation {
    Flat = "flat",
    Hierarchical = "hierarchical",
}

type Listener = (updatedConfig: WorkspaceConfiguration, oldConfig: WorkspaceConfiguration) => void;

export interface IReferencedLibraries {
    include: string[];
    exclude: string[];
    sources: { [binary: string]: string };
}
