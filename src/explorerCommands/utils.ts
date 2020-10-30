// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { DataNode } from "../views/dataNode";

export function isMutable(node: DataNode): boolean {
    // avoid modify dependency files
    const packageExp = /java:(package|packageRoot)(?=.*?\b\+(source|resource)\b)(?=.*?\b\+uri\b)/;
    const resourceOrTypeExp = /java:(file|type|folder)(?=.*?\b\+uri\b)/;

    const contextValue = node.computeContextValue();
    return packageExp.test(contextValue) || resourceOrTypeExp.test(contextValue);
}
