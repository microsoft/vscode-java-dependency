// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, Disposable, ExtensionContext } from "vscode";

class ContextManager implements Disposable {
    private _context: ExtensionContext;
    private _contextValueMap: Map<string, any>;

    public initialize(context: ExtensionContext) {
        this._context = context;
        this._contextValueMap = new Map<string, any>();
    }

    public get context(): ExtensionContext {
        return this._context;
    }

    public async setContextValue(key: string, value: any): Promise<void> {
        this._contextValueMap.set(key, value);
        await commands.executeCommand("setContext", key, value);
    }

    public getContextValue<T>(key: string): T | undefined {
        return <T> this._contextValueMap.get(key);
    }

    public dispose(): void {
        this._contextValueMap.clear();
    }
}

export const contextManager: ContextManager = new ContextManager();
