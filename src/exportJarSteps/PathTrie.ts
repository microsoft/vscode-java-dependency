// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { lstatSync } from "fs";
import { dirname, sep } from "path";
import * as upath from "upath";
import { Uri } from "vscode";
export class PathTrie {
    private root: PathTrieNode;

    constructor() {
        this.root = new PathTrieNode(null, null);
    }

    public insert(input: string): void {
        let currentNode: PathTrieNode = this.root;
        const fsPath: string = Uri.file(input).fsPath;
        const segments: string[] = fsPath.split(sep);

        for (const segment of segments) {
            if (!segment) {
                continue;
            }
            if (!currentNode.children[segment]) {
                currentNode.children[segment] = new PathTrieNode(segment, null);
            }
            currentNode = currentNode.children[segment];
        }
        try {
            currentNode.value = (lstatSync(input).isDirectory()) ?
                input : upath.normalizeSafe(dirname(input));
        } catch (e) {
            currentNode.value = input;
            return;
        }
    }

    public find(fsPath: string): string | undefined {
        let currentNode = this.root;
        const segments: string[] = fsPath.split(sep);

        for (const segment of segments) {
            if (!segment) {
                continue;
            }
            if (currentNode.value) {
                return currentNode.value;
            }
            if (currentNode.children[segment]) {
                currentNode = currentNode.children[segment];
            } else {
                return undefined;
            }
        }

        return currentNode.value;
    }
}

export class PathTrieNode {
    private _key: string;
    private _value: string;
    private _children: INodeChildren;

    constructor(key: string, value: string) {
        this._key = key;
        this._value = value;
        this._children = {};
    }

    public get children(): INodeChildren {
        return this._children;
    }

    public set value(value: string) {
        this._value = value;
    }

    public get value(): string | undefined {
        return this._value;
    }

}

interface INodeChildren {
    [key: string]: PathTrieNode;
}
