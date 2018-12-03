// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Jdtls } from "../java/jdtls";
import { INodeData, NodeKind } from "../java/nodeData";
import { IPackageRootNodeData, PackageRootKind } from "../java/packageRootNodeData";
import { Settings } from "../settings";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { FileNode } from "./fileNode";
import { FolderNode } from "./folderNode";
import { HierachicalPackageRootSubNode } from "./hierachicalPackageRootSubNode";
import { HierarchicalNode } from "./hierarchicalNode";
import { PackageNode } from "./packageNode";
import { PackageTreeNode } from "./packageTreeNode";
import { ProjectNode } from "./projectNode";
import { TypeRootNode } from "./typeRootNode";

export class PackageRootNode extends HierarchicalNode {

    constructor(nodeData: INodeData, parent: DataNode, protected _project: ProjectNode) {
        super(nodeData, parent);
    }

    public isHierarchicalView(): boolean {
        return Settings.getPackagePresentation() === "hierarchical";
    }

    public createFlatChildNodeList(): ExplorerNode[] {
        const result = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.sort();
            this.nodeData.children.forEach((data) => {
                if (data.kind === NodeKind.Package) {
                    result.push(new PackageNode(data, this, this._project, this));
                } else if (data.kind === NodeKind.File) {
                    result.push(new FileNode(data, this));
                } else if (data.kind === NodeKind.Folder) {
                    result.push(new FolderNode(data, this, this._project, this));
                } else if (data.kind === NodeKind.TypeRoot) {
                    result.push(new TypeRootNode(data, this));
                }
            });
        }
        return result;
    }
    public createHierarchicalChildNodeList(): ExplorerNode[] {
        const result = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.nodeData.children.forEach((data) => {
                if (data.kind === NodeKind.File) {
                    result.push(new FileNode(data, this));
                } else if (data.kind === NodeKind.Folder) {
                    result.push(new FolderNode(data, this, this._project, this));
                } else if (data.kind === NodeKind.TypeRoot) {
                    result.push(new TypeRootNode(data, this));
                }
            });
        }
        this.getHierarchicalPackageNodes().forEach((node) => result.push(node));
        result.sort();
        return result;
    }

    public async revealPath(paths: INodeData[]): Promise<[ExplorerNode, INodeData[]]> {
        await this.getChildren();
        const packageRootNodeData = paths.shift();
        const packageNodeData = paths.shift();
        let packageTreeNode: PackageTreeNode = this.getPackageTree();
        // tslint:disable-next-line:no-this-assignment
        let result: DataNode = this;
        while (packageTreeNode.childs.length && packageTreeNode.fullName !== packageNodeData.name) {
            packageTreeNode.childs.forEach((child) => {
                if (packageNodeData.name.startsWith(child.fullName)) {
                    result = new HierachicalPackageRootSubNode(child.getNodeDataFromPackageTreeNode(this.nodeData), result, this._project, child);
                    packageTreeNode = child;
                }
            });
        }
        return [result, paths];
    }

    protected get iconPath(): { light: string; dark: string } {
        const data = <IPackageRootNodeData>this.nodeData;
        if (data.entryKind === PackageRootKind.K_BINARY) {
            return ExplorerNode.resolveIconPath("jar");
        } else {
            return ExplorerNode.resolveIconPath("packagefolder");
        }
    }

    protected getHierarchicalPackageNodes(): ExplorerNode[] {
        const result = [];
        const packageTree = this.getPackageTree();
        packageTree.childs.forEach((childNode) => {
            result.push(new HierachicalPackageRootSubNode(childNode.getNodeDataFromPackageTreeNode(this.nodeData), this, this._project, childNode));
        });
        return result;
    }

    protected loadData(): Thenable<INodeData[]> {
        return Jdtls.getPackageData({ kind: NodeKind.PackageRoot, projectUri: this._project.nodeData.uri, rootPath: this.nodeData.path });
    }

    private getPackageTree(): PackageTreeNode {
        const result: PackageTreeNode = new PackageTreeNode("", "");
        if (this.nodeData.children && this.nodeData.children.length) {
            this.nodeData.children.forEach((child) => {
                if (child.kind === NodeKind.Package) {
                    result.addPackage(child.name);
                }
            });
        }
        result.compressTree();
        return result;
    }
}
