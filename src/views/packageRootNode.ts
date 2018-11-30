// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Jdtls } from "../java/jdtls";
import { INodeData, NodeKind } from "../java/nodeData";
import { IPackageRootNodeData, PackageRootKind } from "../java/packageRootNodeData";
import { Settings } from "../settings";
import { Utility } from "../utility";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { FileNode } from "./fileNode";
import { FolderNode } from "./folderNode";
import { PackageNode } from "./packageNode";
import { ProjectNode } from "./projectNode";
import { TypeRootNode } from "./typeRootNode";

export class PackageRootNode extends DataNode {

    private packageTree: PackageTreeNode;

    constructor(nodeData: INodeData, parent: DataNode, private _project: ProjectNode, packageTree: PackageTreeNode = null) {
        super(nodeData, parent);
        this.packageTree = packageTree;
    }

    // Get correspond packageRootNode when revealPath
    public getPackageNodeFromNodeData(classPackage: INodeData): PackageRootNode {
        // tslint:disable-next-line:no-this-assignment
        let packageRootNode: PackageRootNode = this;
        while (packageRootNode.packageTree === null || packageRootNode.packageTree.fullName !== classPackage.name) {
            let noMatchPackage: boolean = true;
            packageRootNode.createChildNodeList().forEach((child) => {
                if (child instanceof PackageRootNode && classPackage.name.startsWith(child.packageTree.fullName)) {
                    packageRootNode = child;
                    noMatchPackage = false;
                }
            });
            if (noMatchPackage) {
                return null;
            }
        }
        return packageRootNode;
    }

    protected loadData(): Thenable<INodeData[]> {
        if (this.packageTree && this.packageTree.isPackage) {
            // load package data
            return Jdtls.getPackageData({
                kind: NodeKind.Package, projectUri: this._project.nodeData.uri, path: this.packageTree.fullName, rootPath: this.nodeData.path,
            });
        } else {
            return Jdtls.getPackageData({ kind: NodeKind.PackageRoot, projectUri: this._project.nodeData.uri, rootPath: this.nodeData.path });
        }

    }

    protected createFlatChildNodeList(): ExplorerNode[] {
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

    protected createHierarchicalChildNodeList(): ExplorerNode[] {
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

    protected createChildNodeList(): ExplorerNode[] {
        if (Settings.isHierarchicalView()) {
            return this.createHierarchicalChildNodeList();
        } else {
            return this.createFlatChildNodeList();
        }
    }

    protected getHierarchicalPackageNodes(): ExplorerNode[] {
        const result = [];
        const packageTree = this.packageTree ? this.packageTree : this.getPackageTree();
        packageTree.childs.forEach((childNode) => {
            const childNodeData: INodeData = {
                name: childNode.name,
                moduleName: this.nodeData.moduleName,
                path: this.nodeData.path,
                uri: null,
                kind: NodeKind.PackageRoot,
                children: null,
            };
            result.push(new PackageRootNode(childNodeData, this, this._project, childNode));
        });
        return result;
    }

    // Generage tree for packages, use for Hierarchical view
    protected getPackageTree(): PackageTreeNode {
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

    protected get iconPath(): { light: string; dark: string } {
        if (this.packageTree !== null) {
            return ExplorerNode.resolveIconPath("package");
        }
        const data = <IPackageRootNodeData>this.nodeData;
        if (data.entryKind === PackageRootKind.K_BINARY) {
            return ExplorerNode.resolveIconPath("jar");
        } else {
            return ExplorerNode.resolveIconPath("packagefolder");
        }
    }
}

class PackageTreeNode {
    public name: string;
    public fullName: string;
    public childs: PackageTreeNode[] = [];
    public isPackage: boolean = false;

    constructor(packageName: string, parentName: string) {
        const splitPackageName = packageName.split(".");
        this.name = splitPackageName[0];
        this.fullName = parentName === "" ? this.name : parentName + "." + this.name;
        if (splitPackageName.length > 1) {
            this.childs.push(new PackageTreeNode(packageName.substring(this.name.length + 1), this.fullName));
        } else {
            this.isPackage = true;
        }
    }

    public addPackage(packageName: string): void {
        const splitPackageName = packageName.split(".");
        const firstSubName = splitPackageName[0];
        const restname = packageName.substring(firstSubName.length + 1);

        let contains: boolean = false;
        this.childs.forEach((child) => {
            if (child.name === firstSubName) {
                if (restname === "") {
                    child.isPackage = true;
                } else {
                    child.addPackage(restname);
                }
                contains = true;
            }
        });
        if (!contains) {
            this.childs.push(new PackageTreeNode(packageName, this.fullName));
        }
    }

    public compressTree(): void {
        // Don't compress the root node
        while (this.name !== "" && this.childs.length === 1 && !this.isPackage) {
            const child = this.childs[0];
            this.fullName = this.fullName + "." + child.name;
            this.name = this.name + "." + child.name;
            this.childs = child.childs;
            this.isPackage = child.isPackage;
        }
        this.childs.forEach((child) => child.compressTree());
    }
}
