// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { workspace, WorkspaceConfiguration } from "vscode";

export class Settings {
    public static showOutline(): boolean {
        return this._debugSettingsRoot.get("showOutline");
    }

    private static _debugSettingsRoot: WorkspaceConfiguration = workspace.getConfiguration("java.dependency");
}
