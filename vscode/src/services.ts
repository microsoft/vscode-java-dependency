// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ExtensionContext } from "vscode";

export class Services {
    public static initialize(context: ExtensionContext) {
        this._context = context;
    }

    private static _context: ExtensionContext;

    static get context() {
        return this._context;
    }
}
