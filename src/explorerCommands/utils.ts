// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { DataNode } from "../views/dataNode";

export function isMutable(node: DataNode): boolean {
    // avoid modify dependency files
    const sourcePackageExp = /java:(package|packageRoot)(?=.*?\b\+source\b)(?=.*?\b\+uri\b)/;
    const resourcePackageExp = /java:packageRoot(?=.*?\b\+resource\b)(?=.*?\b\+uri\b)/;
    const resourceOrTypeExp = /java:(file|type|folder)(?=.*?\b\+uri\b)/;

    const contextValue = node.computeContextValue();
    return sourcePackageExp.test(contextValue) || resourcePackageExp.test(contextValue) || resourceOrTypeExp.test(contextValue);
}
