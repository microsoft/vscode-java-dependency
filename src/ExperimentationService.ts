// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from "fs-extra";
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

export async function init(context: vscode.ExtensionContext): Promise<void> {
    const packageJson: {} = await fse.readJSON(context.asAbsolutePath("package.json"));
    // tslint:disable: no-string-literal
    const extensionName = `${packageJson["publisher"]}.${packageJson["name"]}`;
    const extensionVersion = packageJson["version"];
    // tslint:enable: no-string-literal
    expService = getExperimentationService(extensionName, extensionVersion,
        TargetPopulation.Public, new ExperimentationTelemetry(), context.globalState);

    // Due to a bug in the tas-client module, a call to isFlightEnabledAsync is required to begin
    // polling the TAS. Due to a separate bug, this call must be preceeded by a call to isCachedFlightEnabled.
    const asyncDummyCheck = (arg: any) => {
        expService?.isFlightEnabledAsync("dummy").then((v) => { return; }).catch((r) => { return; });
    };
    expService?.isCachedFlightEnabled("dummy").then(asyncDummyCheck).catch(asyncDummyCheck);
}
