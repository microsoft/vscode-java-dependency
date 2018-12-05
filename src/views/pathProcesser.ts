// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Uri } from "vscode";
import { Jdtls } from "../java/jdtls";
import { INodeData } from "../java/nodeData";
import { Settings } from "../settings";
import { HierachicalPackageRootNode } from "./hierachicalPackageRootNode";

export class PathProcesser {

    public static async resolvePath(uri: Uri): Promise<INodeData[]> {
        return Jdtls.resolvePath(uri.toString())
            .then((paths: INodeData[]) => PathProcesser.processPaths(paths));
    }

    private static async processPaths(paths: INodeData[]): Promise<INodeData[]> {
        let result = paths;
        result = Settings.isHierarchicalView() ? await HierachicalPackageRootNode.convertPaths(result) : result;
        return result;
    }

}
