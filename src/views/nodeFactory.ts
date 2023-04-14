// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { sendError } from "vscode-extension-telemetry-wrapper";
import { INodeData, NodeKind } from "../java/nodeData";
import { Settings } from "../settings";
import { PrimaryTypeNode } from "./PrimaryTypeNode";
import { ContainerNode } from "./containerNode";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { FileNode } from "./fileNode";
import { FolderNode } from "./folderNode";
import { HierarchicalPackageNode } from "./hierarchicalPackageNode";
import { HierarchicalPackageRootNode } from "./hierarchicalPackageRootNode";
import { PackageNode } from "./packageNode";
import { PackageRootNode } from "./packageRootNode";
import { ProjectNode } from "./projectNode";
import { WorkspaceNode } from "./workspaceNode";
import { HierarchicalPackageNodeData } from "../java/hierarchicalPackageNodeData";

export class NodeFactory {
    /**
     * Factory method to create explorer node.
     * @param nodeData INodeData instance.
     * @param parent parent of this node.
     * @param project project node that this node belongs to.
     * @param rootNode package root node that this node belongs to.
     */
    public static createNode(nodeData: INodeData, parent?: DataNode, project?: ProjectNode, rootNode?: DataNode): ExplorerNode | undefined {
        const isHierarchicalView = Settings.isHierarchicalView();
        try {
            switch (nodeData.kind) {
                case NodeKind.Workspace:
                    return new WorkspaceNode(nodeData, parent);
                case NodeKind.Project:
                    return new ProjectNode(nodeData, parent);
                case NodeKind.Container:
                    if (!parent || !project) {
                        throw new Error("Container node must have parent and project.");
                    }

                    return new ContainerNode(nodeData, parent, project);
                case NodeKind.PackageRoot:
                    if (!parent || !project) {
                        throw new Error("Package root node must have parent and project.");
                    }

                    if (isHierarchicalView) {
                        return new HierarchicalPackageRootNode(nodeData, parent, project);
                    }
                    return new PackageRootNode(nodeData, parent, project);
                case NodeKind.Package:
                    if (!parent || !project || !rootNode) {
                        throw new Error("Package node must have parent, project and root.");
                    }

                    if (nodeData instanceof HierarchicalPackageNodeData) {
                        return new HierarchicalPackageNode(nodeData, parent, project, rootNode);
                    }
                    return new PackageNode(nodeData, parent, project, rootNode);
                case NodeKind.PrimaryType:
                    if (nodeData.metaData && nodeData.metaData[PrimaryTypeNode.K_TYPE_KIND]) {
                        if (!parent) {
                            throw new Error("Primary type node must have parent.");
                        }

                        return new PrimaryTypeNode(nodeData, parent, rootNode);
                    }
                    return undefined;
                case NodeKind.Folder:
                    if (!parent || !project) {
                        throw new Error("Folder node must have parent and project.");
                    }

                    return new FolderNode(nodeData, parent, project, rootNode);
                case NodeKind.CompilationUnit:
                case NodeKind.ClassFile:
                case NodeKind.File:
                    if (!parent) {
                        throw new Error("Folder node must have parent.");
                    }

                    return new FileNode(nodeData, parent);
                default:
                    throw new Error(`Unsupported node kind: ${nodeData.kind}`);
            }
        } catch (error) {
            sendError(new Error(`Unsupported node kind: ${nodeData.kind}`));
            return undefined;
        }
        
    }
}
