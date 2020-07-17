// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { QuickPickItem } from "vscode";

export class QuickPickNode implements QuickPickItem {

    public label: string;
    public description: string;
    public uri?: string;
    public type?: string;
    public picked?: boolean;

    constructor(_label: string, _description: string, _uri?: string, _type?: string, _picked?: boolean) {
        this.label = _label;
        this.description = _description;
        this.uri = _uri;
        this.type = _type;
        this.picked = _picked;
    }

}
