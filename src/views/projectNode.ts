// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ThemeIcon, Uri, workspace } from "vscode";
import { Explorer } from "../constants";
import { ContainerEntryKind, IContainerNodeData } from "../java/containerNodeData";
import { HierarchicalPackageNodeData } from "../java/hierarchicalPackageNodeData";
import { Jdtls } from "../java/jdtls";
import { INodeData, NodeKind } from "../java/nodeData";
import { Settings } from "../settings";
import { ContainerNode } from "./containerNode";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { HierarchicalPackageNode } from "./hierarchicalPackageNode";
import { NodeFactory } from "./nodeFactory";
import { PackageNode } from "./packageNode";
import { PrimaryTypeNode } from "./PrimaryTypeNode";

export class ProjectNode extends DataNode {

    constructor(nodeData: INodeData, parent?: DataNode) {
        super(nodeData, parent);
    }

    public async revealPaths(paths: INodeData[]): Promise<DataNode | undefined> {
        if (!this.uri) {
            return undefined;
        }

        if (workspace.getWorkspaceFolder(Uri.parse(this.uri))) {
            return super.revealPaths(paths);
        }

        // invisible project uri is not contained in workspace
        const childNodeData = paths[0];
        const children: ExplorerNode[] = await this.getChildren();
        if (!children) {
            return undefined;
        }

        const childNode = <DataNode>children.find((child: DataNode) => {
            if (child instanceof HierarchicalPackageNode) {
                return childNodeData.name.startsWith(child.nodeData.name + ".") || childNodeData.name === child.nodeData.name;
            }
            return child.nodeData.name === childNodeData.name && child.path === childNodeData.path;
        });

        // don't shift when child node is an hierarchical node, or it may lose data of package node
        if (!(childNode instanceof HierarchicalPackageNode)) {
            paths.shift();
        }
        return (childNode && paths.length > 0) ? childNode.revealPaths(paths) : childNode;
    }

    protected loadData(): Thenable<INodeData[] | undefined> {
        let result: INodeData[] = [];
        return Jdtls.getPackageData({ kind: NodeKind.Project, projectUri: this.nodeData.uri }).then((res) => {
            if (!res) {
                return undefined;
            }
            const sourceContainer: IContainerNodeData[] = [];
            res.forEach((node) => {
                const containerNode = <IContainerNodeData>node;
                if (containerNode.entryKind === ContainerEntryKind.CPE_SOURCE) {
                    sourceContainer.push(containerNode);
                } else {
                    result.push(node);
                }
            });
            if (sourceContainer.length > 0) {
                return Promise.all(sourceContainer.map((c) => Jdtls.getPackageData({ kind: NodeKind.Container, projectUri: this.uri, path: c.path })))
                    .then((rootPackages) => {
                        if (!rootPackages) {
                            return undefined;
                        }
                        const packages: INodeData[][] = [];
                        for (const root of rootPackages) {
                            if (root !== undefined) {
                                packages.push(root);
                            }
                        }
                        result =  result.concat(...packages);
                        return result;
                    });
            } else {
                return result;
            }
        });
    }

    protected createChildNodeList(): ExplorerNode[] {

        const result: ExplorerNode[] = [];
        const packageData: any[] = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.nodeData.children.forEach((data) => {
                if (data.kind === NodeKind.Container) {
                    result.push(new ContainerNode(data, this, this));
                } else if (data.kind === NodeKind.PackageRoot) {
                    result.push(NodeFactory.createPackageRootNode(data, this, this));
                } else if (data.kind === NodeKind.Package) {
                    // Invisible project may have an empty named package root, in that case,
                    // we will skip it.
                    packageData.push(data);
                } else if (data.kind === NodeKind.PrimaryType) {
                    // For invisible project with empty named package root with a default package,
                    // types will be the project node's children
                    if (data.metaData && data.metaData[PrimaryTypeNode.K_TYPE_KIND]) {
                        result.push(new PrimaryTypeNode(data, this));
                    }
                }
            });
        }

        if (packageData.length > 0) {
            if (Settings.isHierarchicalView()) {
                const data: HierarchicalPackageNodeData = HierarchicalPackageNodeData.createHierarchicalNodeDataByPackageList(packageData);
                const hierarchicalPackageNodes: HierarchicalPackageNode[] = data === undefined ? [] : data.children.map((hierarchicalChildrenNode) =>
                        new HierarchicalPackageNode(hierarchicalChildrenNode, this, this, this));
                result.push(...hierarchicalPackageNodes);
            } else {
                result.push(...packageData.map((data) => new PackageNode(data, this, this, this)));
            }
        }

        result.sort((a: DataNode, b: DataNode) => {
            return b.nodeData.kind - a.nodeData.kind;
        });

        return result;
    }

    protected get iconPath(): ThemeIcon {
        return new ThemeIcon("project");
    }

    protected get contextValue(): string {
        let contextValue: string = Explorer.ContextValueType.Project;
        const natureIds: string[] | undefined = this.nodeData.metaData?.[NATURE_ID];
        if (natureIds) {
            const attributeString: string = getProjectTypeAttributes(natureIds);
            contextValue += attributeString;
        }
        return contextValue;
    }
}

function getProjectTypeAttributes(natureIds: string []): string {
    let attributeString: string = "";
    for (const natureId of natureIds) {
        const readableNature: string = getProjectType(natureId);
        if (readableNature) {
            attributeString += `+${readableNature}`;
        }
    }
    return attributeString;
}

function getProjectType(natureId: string): string {
    switch (natureId) {
        case NatureId.Java:
            return ReadableNature.Java;
        case NatureId.Maven:
            return ReadableNature.Maven;
        case NatureId.Gradle:
            return ReadableNature.Gradle;
        default:
            return "";
    }
}

enum NatureId {
    Maven = "org.eclipse.m2e.core.maven2Nature",
    Gradle = "org.eclipse.buildship.core.gradleprojectnature",
    Java = "org.eclipse.jdt.core.javanature",
}

enum ReadableNature {
    Maven = "maven",
    Gradle = "gradle",
    Java = "java",
}

const NATURE_ID = "NatureId";
