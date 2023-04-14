// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import {
    commands, ConfigurationChangeEvent, ConfigurationTarget, ExtensionContext,
    workspace,
} from "vscode";
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { Commands } from "./commands";
import { syncHandler } from "./syncHandler";
import { contextManager, DependencyExplorer } from "../extension.bundle";

export class Settings {

    public static initialize(context: ExtensionContext): void {
        context.subscriptions.push(workspace.onDidChangeConfiguration((e: ConfigurationChangeEvent) => {
            if ((e.affectsConfiguration("java.dependency.syncWithFolderExplorer") && Settings.syncWithFolderExplorer()) ||
                    e.affectsConfiguration("java.dependency.showMembers") ||
                    e.affectsConfiguration("java.dependency.packagePresentation") ||
                    e.affectsConfiguration("java.project.explorer.filters") ||
                    e.affectsConfiguration("files.exclude")) {
                commands.executeCommand(Commands.VIEW_PACKAGE_INTERNAL_REFRESH);
            } else if (e.affectsConfiguration("java.dependency.autoRefresh")) {
                syncHandler.updateFileWatcher(Settings.autoRefresh());
            } else if (e.affectsConfiguration("java.dependency.refreshDelay")) {
                // TODO: getInstance() should not have parameter if it means to be a singleton.
                DependencyExplorer.getInstance(contextManager.context)
                    .dataProvider.setRefreshDebounceFunc(Settings.refreshDelay());
            }
        }));

        syncHandler.updateFileWatcher(Settings.autoRefresh());

        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_LINKWITHFOLDER, Settings.linkWithFolderCommand));

        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_UNLINKWITHFOLDER, Settings.unlinkWithFolderCommand));

        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_CHANGETOFLATPACKAGEVIEW,
            Settings.changeToFlatPackageView));

        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_CHANGETOHIERARCHICALPACKAGEVIEW,
            Settings.changeToHierarchicalPackageView));
    }

    public static linkWithFolderCommand(): void {
        workspace.getConfiguration("java.dependency").update("syncWithFolderExplorer", true, false);
    }

    public static unlinkWithFolderCommand(): void {
        workspace.getConfiguration("java.dependency").update("syncWithFolderExplorer", false, false);
    }

    public static changeToFlatPackageView(): void {
        workspace.getConfiguration("java.dependency").update("packagePresentation", PackagePresentation.Flat, false);
    }

    public static changeToHierarchicalPackageView(): void {
        workspace.getConfiguration("java.dependency").update("packagePresentation", PackagePresentation.Hierarchical, false);
    }

    public static switchNonJavaResourceFilter(enabled: boolean): void {
        workspace.getConfiguration("java.project.explorer").update(
            "filters",
            { nonJavaResources: enabled },
            ConfigurationTarget.Workspace);
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
        workspace.getConfiguration("java.project").update("referencedLibraries", updateSetting);
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
        return workspace.getConfiguration("java.dependency").get("showMembers", false);
    }

    public static autoRefresh(): boolean {
        return workspace.getConfiguration("java.dependency").get("autoRefresh", true);
    }

    public static syncWithFolderExplorer(): boolean {
        return workspace.getConfiguration("java.dependency").get("syncWithFolderExplorer", true);
    }

    public static isHierarchicalView(): boolean {
        return workspace.getConfiguration("java.dependency").get("packagePresentation") === PackagePresentation.Hierarchical;
    }

    public static refreshDelay(): number {
        return workspace.getConfiguration("java.dependency").get("refreshDelay", 2000);
    }

    public static getExportJarTargetPath(): string {
        // tslint:disable-next-line: no-invalid-template-strings
        return workspace.getConfiguration("java.project.exportJar").get<string>("targetPath", "${workspaceFolder}/${workspaceFolderBasename}.jar");
    }

    /**
     * Get whether non-Java resources should be filtered in the explorer.
     */
    public static nonJavaResourcesFiltered(): boolean {
        const filter: IExplorerFilter = workspace.getConfiguration("java.project.explorer").get<IExplorerFilter>("filters", {});
        return !!filter.nonJavaResources;
    }
}

enum PackagePresentation {
    Flat = "flat",
    Hierarchical = "hierarchical",
}

export interface IReferencedLibraries {
    include: string[];
    exclude: string[];
    sources: { [binary: string]: string };
}

interface IExplorerFilter {
    nonJavaResources?: boolean
}
