// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { IExperimentationService } from "vscode-tas-client";

export class ExpManager {
    private flightsLoaded: boolean = false;
    private exp: IExperimentationService | undefined;

    public initialize(exp: IExperimentationService | undefined) {
        this.exp = exp;
    }

    public async isFlightEnabled(flight: string): Promise<boolean> {
        if (!this.exp) {
            return false;
        }

        try {
            if (this.flightsLoaded) {
                // If we've already called isFlightEnabledAsync, that means we have data up to date,
                // and we can use the cache instead.
                return await this.exp.isCachedFlightEnabled(flight);
            } else {
                // If we haven't checked any flight, there's a chance the data in the experimentation service isn't updated.
                // We call isFlightEnabledAsync which will refresh all the flight/feature data.
                // We just need to call it once.
                const enabled = await this.exp.isFlightEnabledAsync(flight);
                this.flightsLoaded = true;
                return enabled;
            }
        } catch (e) {
            // tslint:disable-next-line: no-console
            console.log(`Could not retrieve data from Experimentation service: ${e}`);
        }
        return false;
    }
}

export const expManager: ExpManager = new ExpManager();
