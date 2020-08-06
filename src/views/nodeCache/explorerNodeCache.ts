// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import { Uri } from "vscode";
import { DataNode } from "../dataNode";
import { ExplorerNode } from "../explorerNode";
import { Trie, TrieNode } from "./Trie";

class ExplorerNodeCache {

    private mutableNodeCache: Trie = new Trie();

    public getDataNode(uri: Uri): DataNode | undefined {
        return this.mutableNodeCache.find(uri.fsPath)?.value;
    }

    /**
     * Find the node whose uri is best match to the input uri, which means
     * the uri of the returned node is equal to or ancestor of the input one.
     * @param uri
     */
    public findBestMatchNodeByUri(uri: Uri): DataNode | undefined {
        const parentDir = path.dirname(uri.fsPath);
        const ancestor: TrieNode = this.mutableNodeCache.findAncestorNodeWithData(parentDir);
        return ancestor?.value;
    }

    public saveNode(node: ExplorerNode): void {
        if (node instanceof DataNode && node.uri) {
            this.mutableNodeCache.insert(node);
        }
    }

    public saveNodes(nodes: ExplorerNode[]): void {
        for (const node of nodes) {
            this.saveNode(node);
        }
    }

    public removeNodeChildren(node: ExplorerNode): void {
        if (!node) {
            this.mutableNodeCache.clearAll();
            return;
        }

        if (!(node instanceof DataNode)) {
            return;
        }

        const trieNode: TrieNode | undefined = this.mutableNodeCache.find(Uri.parse(node.uri).fsPath);
        if (trieNode) {
            trieNode.removeChildren();
        }
    }
}

export const explorerNodeCache: ExplorerNodeCache = new ExplorerNodeCache();
