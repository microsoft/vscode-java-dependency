// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { QuickInputButtons, QuickPick, QuickPickItem, Uri, window } from "vscode";

export function createPickBox<T extends QuickPickItem>(title: string, placeholder: string, items: T[],
                                                       backBtnEnabled: boolean, canSelectMany: boolean = false): QuickPick<T> {
    const pickBox = window.createQuickPick<T>();
    pickBox.title = title;
    pickBox.placeholder = placeholder;
    pickBox.canSelectMany = canSelectMany;
    pickBox.items = items;
    pickBox.ignoreFocusOut = true;
    pickBox.buttons = backBtnEnabled ? [(QuickInputButtons.Back)] : [];
    return pickBox;
}
