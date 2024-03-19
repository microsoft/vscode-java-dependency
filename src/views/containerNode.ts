// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ThemeIcon, Uri } from "vscode";
import { Explorer } from "../constants";
import { Jdtls } from "../java/jdtls";
import { INodeData, NodeKind } from "../java/nodeData";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { NodeFactory } from "./nodeFactory";
import { ProjectNode } from "./projectNode";

export class ContainerNode extends DataNode {
    constructor(nodeData: INodeData, parent: DataNode, private readonly _project: ProjectNode) {
        super(nodeData, parent);
    }

    public get projectBasePath() {
        return this._project.uri && Uri.parse(this._project.uri).fsPath;
    }

    public getContainerType(): string {
        const containerPath: string = this._nodeData.path || "";
        if (containerPath.startsWith(ContainerPath.JRE)) {
            return ContainerType.JRE;
        } else if (containerPath.startsWith(ContainerPath.Maven)) {
            return ContainerType.Maven;
        } else if (containerPath.startsWith(ContainerPath.Gradle)) {
            return ContainerType.Gradle;
        } else if (containerPath.startsWith(ContainerPath.ReferencedLibrary) && this._project.isUnmanagedFolder()) {
            // currently, we only support editing referenced libraries in unmanaged folders
            return ContainerType.ReferencedLibrary;
        }
        return ContainerType.Unknown;
    }

    protected async loadData(): Promise<INodeData[]> {
        return Jdtls.getPackageData({ kind: NodeKind.Container, projectUri: this._project.uri, path: this.path });
    }

    protected createChildNodeList(): ExplorerNode[] {
        const result: (ExplorerNode | undefined)[] = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.nodeData.children.forEach((nodeData) => {
                result.push(NodeFactory.createNode(nodeData, this, this._project));
            });
        }
        return result.filter(<T>(n?: T): n is T => Boolean(n));
    }

    protected get contextValue(): string {
        let contextValue: string = Explorer.ContextValueType.Container;
        const containerType: string = this.getContainerType();
        if (containerType) {
            contextValue += `+${containerType}`;
        }
        return contextValue;
    }

    protected get iconPath(): ThemeIcon {
        return new ThemeIcon("folder-library");
    }
}

export enum ContainerType {
    JRE = "jre",
    Maven = "maven",
    Gradle = "gradle",
    ReferencedLibrary = "referencedLibrary",
    Unknown = "",
}

const enum ContainerPath {
    JRE = "org.eclipse.jdt.launching.JRE_CONTAINER",
    Maven = "org.eclipse.m2e.MAVEN2_CLASSPATH_CONTAINER",
    Gradle = "org.eclipse.buildship.core.gradleclasspathcontainer",
    ReferencedLibrary = "REFERENCED_LIBRARIES_PATH",
}
