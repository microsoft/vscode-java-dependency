// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Jdtls } from "../java/jdtls";
import { INodeData, NodeKind } from "../java/nodeData";
import { IPackageRootNodeData, PackageRootKind } from "../java/packageRootNodeData";
import { ContainerNode } from "./containerNode";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { FileNode } from "./fileNode";
import { FolderNode } from "./folderNode";
import { PackageNode } from "./packageNode";
import { PrimaryTypeNode } from "./PrimaryTypeNode";
import { ProjectNode } from "./projectNode";

export class PackageRootNode extends DataNode {

    constructor(nodeData: INodeData, parent: DataNode, protected _project: ProjectNode) {
        super(nodeData, parent);
    }

    protected loadData(): Thenable<INodeData[]> {
        return Jdtls.getPackageData({ kind: NodeKind.PackageRoot, projectUri: this._project.nodeData.uri, rootPath: this.nodeData.path });
    }

    protected createChildNodeList(): ExplorerNode[] {
        const result = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.sort();
            this.nodeData.children.forEach((data: INodeData) => {
                if (data.kind === NodeKind.Package) {
                    result.push(new PackageNode(data, this, this._project, this));
                } else if (data.kind === NodeKind.File) {
                    result.push(new FileNode(data, this));
                } else if (data.kind === NodeKind.Folder) {
                    result.push(new FolderNode(data, this, this._project, this));
                } else if (data.kind === NodeKind.PrimaryType) {
                    if (data.metaData && data.metaData[PrimaryTypeNode.K_TYPE_KIND]) {
                        result.push(new PrimaryTypeNode(data, this));
                    }
                }
            });
        }
        return result;
    }

    protected get description(): string | boolean {
        const data = <IPackageRootNodeData>this.nodeData;
        if (data.entryKind === PackageRootKind.K_BINARY) {
            return data.path;
        } else {
            return undefined;
        }
    }

    protected get contextValue(): string {
        const data = <IPackageRootNodeData>this.nodeData;
        if (data.entryKind === PackageRootKind.K_BINARY) {
            const parent = <ContainerNode>this.getParent();
            return `jar/${parent.name}`;
        } else { // Currently PackageFolder does not use context value
            return undefined;
        }
    }

    protected get iconPath(): { light: string; dark: string } {
        const data = <IPackageRootNodeData>this.nodeData;
        if (data.entryKind === PackageRootKind.K_BINARY) {
            return ExplorerNode.resolveIconPath("jar");
        } else {
            return ExplorerNode.resolveIconPath("packagefolder");
        }
    }
}
