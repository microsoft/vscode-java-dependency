// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { addContextProperty, sendInfo } from "vscode-extension-telemetry-wrapper";
import { getExperimentationService, IExperimentationService, IExperimentationTelemetry, TargetPopulation } from "vscode-tas-client";

class ExperimentationTelemetry implements IExperimentationTelemetry {

    public setSharedProperty(name: string, value: string): void {
        addContextProperty(name, value);
    }

    public postEvent(eventName: string, props: Map<string, string>): void {
        const data: any = {};
        data.__event_name__ = eventName;
        for (const [property, value] of props) {
            data[property] = value;
        }
        sendInfo("", data);
    }
}

let expService: IExperimentationService;

export function getExpService() {
    return expService;
}

export function init(context: vscode.ExtensionContext) {
    const extensionName = "vscjava.vscode-java-dependency";
    const extensionVersion = "0.10.1";
    expService = getExperimentationService(extensionName, extensionVersion,
        TargetPopulation.Public, new ExperimentationTelemetry(), context.globalState);
}
