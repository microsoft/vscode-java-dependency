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
        return Uri.parse(this._project.uri).fsPath;
    }

    protected loadData(): Thenable<INodeData[]> {
        return Jdtls.getPackageData({ kind: NodeKind.Container, projectUri: this._project.uri, path: this.path });
    }
    protected createChildNodeList(): ExplorerNode[] {
        const result = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.sort();
            this.nodeData.children.forEach((classpathNode) => {
                result.push(NodeFactory.createPackageRootNode(classpathNode, this, this._project));
            });
        }
        return result;
    }

    protected get contextValue(): string {
        let contextValue: string = Explorer.ContextValueType.Container;
        const containerType: string = getContainerType(this._nodeData.path);
        if (containerType) {
            contextValue += `+${containerType}`;
        }
        return contextValue;
    }

    protected get iconPath(): ThemeIcon {
        return new ThemeIcon("library");
    }
}

function getContainerType(containerPath: string | undefined): string {
    if (!containerPath) {
        return "";
    } else if (containerPath.startsWith(ContainerPath.JRE)) {
        return "jre";
    } else if (containerPath.startsWith(ContainerPath.Maven)) {
        return "maven";
    } else if (containerPath.startsWith(ContainerPath.Gradle)) {
        return "gradle";
    } else if (containerPath.startsWith(ContainerPath.ReferencedLibrary)) {
        return "referencedLibrary";
    } else {
        return "";
    }
}

const enum ContainerPath {
    JRE = "org.eclipse.jdt.launching.JRE_CONTAINER",
    Maven = "org.eclipse.m2e.MAVEN2_CLASSPATH_CONTAINER",
    Gradle = "org.eclipse.buildship.core.gradleclasspathcontainer",
    ReferencedLibrary = "REFERENCED_LIBRARIES_PATH",
}
