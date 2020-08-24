// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ThemeIcon } from "vscode";
import { Explorer } from "../constants";
import { ContainerEntryKind, IContainerNodeData } from "../java/containerNodeData";
import { Jdtls } from "../java/jdtls";
import { INodeData, NodeKind } from "../java/nodeData";
import { ContainerNode } from "./containerNode";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { NodeFactory } from "./nodeFactory";

export class ProjectNode extends DataNode {

    constructor(nodeData: INodeData, parent: DataNode) {
        super(nodeData, parent);
    }

    protected loadData(): Thenable<INodeData[]> {
        let result: INodeData[] = [];
        return Jdtls.getPackageData({ kind: NodeKind.Project, projectUri: this.nodeData.uri }).then((res) => {
            if (!res) {
                return;
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
                            return;
                        }
                        result = result.concat(...rootPackages);
                        return result;
                    });
            } else {
                return result;
            }
        });
    }

    protected createChildNodeList(): ExplorerNode[] {

        const result = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.nodeData.children.forEach((data) => {
                if (data.kind === NodeKind.Container) {
                    result.push(new ContainerNode(data, this, this));
                } else if (data.kind === NodeKind.PackageRoot) {
                    result.push(NodeFactory.createPackageRootNode(data, this, this));
                }
            });
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
        const natureIds: string[] | undefined = this.nodeData.metaData[NATURE_ID];
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
