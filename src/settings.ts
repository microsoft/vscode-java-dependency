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
            if (updatedConfig.showOutline !== this._depdendencyConfig.showOutline
                || updatedConfig.packagePresentation !== this._depdendencyConfig.packagePresentation) {
                commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH);
            }
            this._depdendencyConfig = updatedConfig;

        }));

        const instrumented = instrumentOperation(Commands.VIEW_PACKAGE_CHANGEREPRESENTATION, Settings.changePackageRepresentation);
        context.subscriptions.push(commands.registerCommand(Commands.VIEW_PACKAGE_CHANGEREPRESENTATION, instrumented));
    }

    public static changePackageRepresentation(): void {
        const representationSetting = Settings.isHierarchicalView() ? PackagePresentation.Flat : PackagePresentation.Hierarchical;
        workspace.getConfiguration().update("java.dependency.packagePresentation", representationSetting, false);
    }

    public static showOutline(): boolean {
        return this._depdendencyConfig.get("showOutline");
    }

    public static syncWithFolderExplorer(): boolean {
        return this._depdendencyConfig.get("syncWithFolderExplorer");
    }

    public static isHierarchicalView(): boolean {
        return this._depdendencyConfig.get("packagePresentation") === PackagePresentation.Hierarchical;
    }

    private static _depdendencyConfig: WorkspaceConfiguration = workspace.getConfiguration("java.dependency");
}

enum PackagePresentation {
    Flat = "flat",
    Hierarchical = "hierarchical",
}
