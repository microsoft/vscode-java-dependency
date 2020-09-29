// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { EventEmitter } from "events";

export class Lock {
    private _locked: boolean;
    private _eventEmitter: EventEmitter;

    constructor() {
        this._locked = false;
        this._eventEmitter = new EventEmitter();
    }

    public async acquire(): Promise<void> {
        return new Promise((resolve) => {
            if (!this._locked) {
                this._locked = true;
                return resolve();
            }

            const tryAcquire = () => {
                if (!this._locked) {
                    this._locked = true;
                    this._eventEmitter.removeListener("release", tryAcquire);
                    return resolve();
                }
            };
            this._eventEmitter.on("release", tryAcquire);
        });
    }

    public release(): void {
        this._locked = false;
        setImmediate(() => this._eventEmitter.emit("release"));
    }
}
