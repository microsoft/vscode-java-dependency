// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { QuickPickItem } from "vscode";

export interface IJarQuickPickItem extends QuickPickItem {
    label: string;
    description: string;
    uri?: string;
    type?: string;
    picked?: boolean;
}
