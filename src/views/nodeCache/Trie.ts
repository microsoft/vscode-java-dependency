// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import { Uri } from "vscode";
import { DataNode } from "../dataNode";

export class Trie {
    private root: TrieNode;

    constructor() {
        this.root = new TrieNode(null, null);
    }

    public insert(input: DataNode): void {
        let currentNode: TrieNode = this.root;
        const fsPath: string = Uri.parse(input.uri).fsPath;
        const segments: string[] = fsPath.split(path.sep);

        for (const segment of segments) {
            if (!segment) {
                continue;
            }
            if (!currentNode.children[segment]) {
                currentNode.children[segment] = new TrieNode(segment, null);
            }
            currentNode = currentNode.children[segment];
        }

        currentNode.value = input;
    }

    public find(fsPath: string): TrieNode | undefined {
        let currentNode = this.root;
        const segments: string[] = fsPath.split(path.sep);

        for (const segment of segments) {
            if (!segment) {
                continue;
            }
            if (currentNode.children[segment]) {
                currentNode = currentNode.children[segment];
            } else {
                return undefined;
            }
        }

        return currentNode;
    }

    public findAncestorNodeWithData(fsPath: string): TrieNode | undefined {
        let currentNode: TrieNode = this.root;
        let res: TrieNode | undefined;
        const segments: string[] = fsPath.split(path.sep);

        for (const segment of segments) {
            if (!segment) {
                continue;
            }
            if (currentNode.children[segment]) {
                currentNode = currentNode.children[segment];
            } else {
                break;
            }

            if (currentNode.value) {
                res = currentNode;
            }
        }

        return res;
    }

    public clearAll(): void {
        this.root.removeChildren();
    }
}

export class TrieNode {
    private _key: string;
    private _value: DataNode;
    private _children: INodeChildren;

    constructor(key: string, value: DataNode) {
        this._key = key;
        this._value = value;
        this._children = {};
    }

    public get children(): INodeChildren {
        return this._children;
    }

    public set value(value: DataNode) {
        this._value = value;
    }

    public get value(): DataNode | undefined {
        return this._value;
    }

    public removeChildren(): void {
        this._children = {};
        if (this._value?.nodeData?.children) {
            this._value.nodeData.children = undefined;
        }
    }
}

interface INodeChildren {
    [key: string]: TrieNode;
}
