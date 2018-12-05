// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { INodeData } from "../java/nodeData";
import { DataNode } from "./dataNode";
import { HierachicalPackageRootNode } from "./hierachicalPackageRootNode";
import { PackageRootNode } from "./packageRootNode";
import { ProjectNode } from "./projectNode";

export class NodeFactory {
    public static createPackageRootNode(nodeData: INodeData, parent: DataNode, project: ProjectNode): PackageRootNode {
        return HierachicalPackageRootNode.isHierarchicalView() ?
            new HierachicalPackageRootNode(nodeData, parent, project) : new PackageRootNode(nodeData, parent, project);
    }
}
