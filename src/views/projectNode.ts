// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ThemeIcon, Uri, workspace } from "vscode";
import { Explorer } from "../constants";
import { HierarchicalPackageNodeData } from "../java/hierarchicalPackageNodeData";
import { Jdtls } from "../java/jdtls";
import { INodeData, NodeKind } from "../java/nodeData";
import { Settings } from "../settings";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { HierarchicalPackageNode } from "./hierarchicalPackageNode";
import { NodeFactory } from "./nodeFactory";

export class ProjectNode extends DataNode {

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

    public isUnmanagedFolder(): boolean {
        const natureIds: string[] = this.nodeData.metaData?.[NATURE_ID] || [];
        for (const natureId of natureIds) {
            if (natureId === NatureId.UnmanagedFolder) {
                 return true;
            }
        }
        return false;
    }

    protected async loadData(): Promise<INodeData[]> {
        return Jdtls.getPackageData({ kind: NodeKind.Project, projectUri: this.nodeData.uri });
    }

    protected createChildNodeList(): ExplorerNode[] {
        const result: (ExplorerNode | undefined)[] = [];
        const packageData: any[] = [];
        if (this.nodeData.children?.length) {
            this.nodeData.children.forEach((nodeData) => {
                if (nodeData.kind === NodeKind.Package) {
                    packageData.push(nodeData);
                } else {
                    result.push(NodeFactory.createNode(nodeData, this, this));
                }
            });
        }

        if (packageData.length > 0) {
            if (Settings.isHierarchicalView()) {
                const data: HierarchicalPackageNodeData = HierarchicalPackageNodeData.createHierarchicalNodeDataByPackageList(packageData);
                if (data) {
                    result.push(...data.children.map(d => NodeFactory.createNode(d, this, this, this)));
                }
            } else {
                result.push(...packageData.map((d) => NodeFactory.createNode(d, this, this, this)));
            }
        }

        return result.filter(<T>(n?: T): n is T => Boolean(n));
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
        if (this.nodeData.metaData?.MaxSourceVersion >= 16) {
            contextValue += "+allowRecord";
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
        case NatureId.BspGradle:
            return ReadableNature.BspGradle;
        case NatureId.UnmanagedFolder:
            return ReadableNature.UnmanagedFolder;
        default:
            return "";
    }
}

enum NatureId {
    Maven = "org.eclipse.m2e.core.maven2Nature",
    Gradle = "org.eclipse.buildship.core.gradleprojectnature",
    BspGradle = "com.microsoft.gradle.bs.importer.GradleBuildServerProjectNature",
    UnmanagedFolder = "org.eclipse.jdt.ls.core.unmanagedFolder",
    Java = "org.eclipse.jdt.core.javanature",
}

enum ReadableNature {
    Maven = "maven",
    Gradle = "gradle",
    BspGradle = "bsp-gradle",
    UnmanagedFolder = "unmanagedFolder",
    Java = "java",
}

const NATURE_ID = "NatureId";
