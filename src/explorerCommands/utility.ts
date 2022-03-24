// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { isJavaIdentifier, isKeyword } from "../utility";
import { DataNode } from "../views/dataNode";
import { ExplorerNode } from "../views/explorerNode";

export function isMutable(node: DataNode): boolean {
    // avoid modify dependency files
    const packageExp = /java:(package|packageRoot)(?=.*?\b\+(source|resource)\b)(?=.*?\b\+uri\b)/;
    const resourceOrTypeExp = /java:(file|type|folder)(?=.*?\b\+uri\b)/;

    const contextValue = node.computeContextValue();
    if (!contextValue) {
        return false;
    }
    return packageExp.test(contextValue) || resourceOrTypeExp.test(contextValue);
}

export function checkJavaQualifiedName(value: string): string {
    if (!value || !value.trim()) {
        return "Input cannot be empty.";
    }

    for (const part of value.split(".")) {
        if (isKeyword(part)) {
            return `Keyword '${part}' cannot be used.`;
        }

        if (!isJavaIdentifier(part)) {
            return `Invalid Java qualified name.`;
        }
    }

    return "";
}

export function getCmdNode(selectedNodes: readonly ExplorerNode[], node?: DataNode): DataNode | undefined {
    // if command not invoked by context menu, use selected node in explorer
    if (node) {
        return node;
    }

    if (selectedNodes.length > 0) {
        return selectedNodes[0] as DataNode;
    }

    return undefined;
}
