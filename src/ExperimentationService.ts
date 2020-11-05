// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { addContextProperty } from "vscode-extension-telemetry-wrapper";
import { getExperimentationService, IExperimentationService, IExperimentationTelemetry, TargetPopulation } from "vscode-tas-client";

class ExperimentationTelemetry implements IExperimentationTelemetry {

    public setSharedProperty(name: string, value: string): void {
        addContextProperty(name, value);
    }

    public postEvent(_eventName: string, _props: Map<string, string>): void {
        // do nothing
    }
}

let expService: IExperimentationService;

export function getExpService() {
    return expService;
}

export function init(context: vscode.ExtensionContext): void {
    const packageJson: {} = require("../package.json");
    // tslint:disable: no-string-literal
    const extensionName = `${packageJson["publisher"]}.${packageJson["name"]}`;
    const extensionVersion = packageJson["version"];
    // tslint:enable: no-string-literal
    expService = getExperimentationService(extensionName, extensionVersion,
        TargetPopulation.Public, new ExperimentationTelemetry(), context.globalState);

    // Due to a bug in the tas-client module, a call to isFlightEnabledAsync is required to begin
    // polling the TAS. Due to a separate bug, this call must be preceeded by a call to isCachedFlightEnabled.
    const asyncDummyCheck = (_arg: any) => {
        expService?.isFlightEnabledAsync("dummy").then((_v) => { return; }).catch((_r) => { return; });
    };
    expService?.isCachedFlightEnabled("dummy").then(asyncDummyCheck).catch(asyncDummyCheck);
}
