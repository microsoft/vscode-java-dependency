// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { DataNode } from "../views/dataNode";

export function isMutable(node: DataNode): boolean {
    const packageExp = /java:(package|packageRoot)(?=.*?\b\+source\b)(?=.*?\b\+uri\b)/;
    const fileExp = /java:file(?=.*?\b\+uri\b)/;
    const typeExp = /java:type(?=.*?\b\+uri\b)/;

    const contextValue = node.computeContextValue();
    return packageExp.test(contextValue) || fileExp.test(contextValue) || typeExp.test(contextValue);
}
