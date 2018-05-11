// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import TelemetryReporter from "vscode-extension-telemetry";

const extensionId = "vscjava.vscode-java-explorer";
const packageJSON = vscode.extensions.getExtension(extensionId).packageJSON;
const extensionVersion: string = packageJSON.version;
const aiKey: string = packageJSON.aiKey;

export class Telemetry {
    public static sendEvent(eventName: string, properties?: { [key: string]: string; }, measures?: { [key: string]: number; }) {
        this._client.sendTelemetryEvent(eventName, properties, measures);
    }
    private static _client = new TelemetryReporter(extensionId, extensionVersion, aiKey);
}
