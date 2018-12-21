// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { INodeData } from "../java/nodeData";
import { Settings } from "../settings";
import { DataNode } from "./dataNode";
import { HierarchicalPackageRootNode } from "./hierarchicalPackageRootNode";
import { PackageRootNode } from "./packageRootNode";
import { ProjectNode } from "./projectNode";

export class NodeFactory {
    public static createPackageRootNode(nodeData: INodeData, parent: DataNode, project: ProjectNode): PackageRootNode {
        return Settings.isHierarchicalView() ?
            new HierarchicalPackageRootNode(nodeData, parent, project) : new PackageRootNode(nodeData, parent, project);
    }
}
