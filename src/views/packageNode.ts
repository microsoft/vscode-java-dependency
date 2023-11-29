// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ThemeIcon } from "vscode";
import { Explorer } from "../constants";
import { Jdtls } from "../java/jdtls";
import { INodeData, NodeKind } from "../java/nodeData";
import { IPackageRootNodeData, PackageRootKind } from "../java/packageRootNodeData";
import { isTest } from "../utility";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { ProjectNode } from "./projectNode";
import { NodeFactory } from "./nodeFactory";

export class PackageNode extends DataNode {
    constructor(nodeData: INodeData, parent: DataNode, protected _project: ProjectNode, protected _rootNode: DataNode) {
        super(nodeData, parent);
    }

    public isSourcePackage(): boolean {
        const parentData = <IPackageRootNodeData> this._rootNode.nodeData;
        return parentData.entryKind === PackageRootKind.K_SOURCE || parentData.kind === NodeKind.Project;
    }

    protected async loadData(): Promise<INodeData[]> {
        return Jdtls.getPackageData({
            kind: NodeKind.Package,
            projectUri: this._project.nodeData.uri,
            path: this.nodeData.name,
            handlerIdentifier: this.nodeData.handlerIdentifier,
        });
    }

    protected createChildNodeList(): ExplorerNode[] {
        const result: (ExplorerNode | undefined)[] = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.nodeData.children.forEach((nodeData) => {
                result.push(NodeFactory.createNode(nodeData, this, this._project, this._rootNode));
            });
        }
        return result.filter(<T>(n?: T): n is T => Boolean(n));
    }

    protected get iconPath(): ThemeIcon {
        return new ThemeIcon("symbol-package");
    }

    protected get contextValue(): string | undefined {
        const parentData = <IPackageRootNodeData> this._rootNode.nodeData;
        let contextValue: string = Explorer.ContextValueType.Package;
        if (parentData.entryKind === PackageRootKind.K_SOURCE || parentData.kind === NodeKind.Project) {
            contextValue += "+source";
            if (this._project.nodeData.metaData?.MaxSourceVersion >= 16) {
                contextValue += "+allowRecord";
            }
        } else if (parentData.entryKind === PackageRootKind.K_BINARY) {
            contextValue += "+binary";
        }
        if (isTest(parentData)) {
            contextValue += "+test";
        }
        return contextValue;
    }
}
