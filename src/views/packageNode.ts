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
import { FileNode } from "./fileNode";
import { FolderNode } from "./folderNode";
import { PrimaryTypeNode } from "./PrimaryTypeNode";
import { ProjectNode } from "./projectNode";

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
        const result: ExplorerNode[] = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.sort();
            this.nodeData.children.forEach((nodeData) => {
                if (nodeData.kind === NodeKind.File) {
                    result.push(new FileNode(nodeData, this));
                } else if (nodeData.kind === NodeKind.PrimaryType) {
                    if (nodeData.metaData && nodeData.metaData[PrimaryTypeNode.K_TYPE_KIND]) {
                        result.push(new PrimaryTypeNode(nodeData, this, this._rootNode));
                    }
                } else if (nodeData.kind === NodeKind.Folder) {
                    result.push(new FolderNode(nodeData, this, this._project, this._rootNode));
                }
            });
        }
        return result;
    }

    protected get iconPath(): ThemeIcon {
        return new ThemeIcon("symbol-package");
    }

    protected get contextValue(): string | undefined {
        const parentData = <IPackageRootNodeData> this._rootNode.nodeData;
        let contextValue: string = Explorer.ContextValueType.Package;
        if (parentData.entryKind === PackageRootKind.K_SOURCE || parentData.kind === NodeKind.Project) {
            contextValue += "+source";
        } else if (parentData.entryKind === PackageRootKind.K_BINARY) {
            contextValue += "+binary";
        }
        if (isTest(parentData)) {
            contextValue += "+test";
        }
        return contextValue;
    }
}
