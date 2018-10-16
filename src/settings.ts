// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, ConfigurationChangeEvent, ExtensionContext, workspace, WorkspaceConfiguration } from "vscode";
import { Commands } from "./commands";

export class Settings {

    public static initialize(context: ExtensionContext): void {
        context.subscriptions.push(workspace.onDidChangeConfiguration((e: ConfigurationChangeEvent) => {
            if (!e.affectsConfiguration("java.dependency")) {
                return;
            }
            const updatedConfig = workspace.getConfiguration("java.dependency");
            if (updatedConfig.showOutline !== this._depdendencyConfig.showOutline) {
                commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH);
            }
            this._depdendencyConfig = updatedConfig;

        }));
    }

    public static showOutline(): boolean {
        return this._depdendencyConfig.get("showOutline");
    }

    public static syncWithFolderExplorer(): boolean {
        return this._depdendencyConfig.get("syncWithFolderExplorer");
    }

    private static _depdendencyConfig: WorkspaceConfiguration = workspace.getConfiguration("java.dependency");
}
