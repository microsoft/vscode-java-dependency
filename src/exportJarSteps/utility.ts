// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { QuickInputButtons, QuickPick, QuickPickItem, window } from "vscode";
import { IExportJarStepExecutor } from "./IExportJarStepExecutor";

export interface IJarQuickPickItem extends QuickPickItem {
    uri?: string;
    type?: string;
}

export function createPickBox(title: string, placeholder: string, items: IJarQuickPickItem[],
                              backBtnEnabled: boolean, canSelectMany: boolean = false): QuickPick<IJarQuickPickItem> {
    const pickBox = window.createQuickPick<IJarQuickPickItem>();
    pickBox.title = title;
    pickBox.placeholder = placeholder;
    pickBox.canSelectMany = canSelectMany;
    pickBox.items = items;
    pickBox.ignoreFocusOut = true;
    pickBox.buttons = backBtnEnabled ? [(QuickInputButtons.Back)] : [];
    return pickBox;
}
