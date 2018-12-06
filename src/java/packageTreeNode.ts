// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { INodeData, NodeKind } from "./nodeData";

export class PackageTreeNode {

    public static createEmptyRootNode(): PackageTreeNode {
        return new PackageTreeNode("", "");
    }

    public name: string;
    public fullName: string;
    public childs: PackageTreeNode[] = [];
    public isPackage: boolean = false;

    private constructor(name: string, parentFullName: string) {
        this.name = name;
        this.fullName = parentFullName === "" ? name : parentFullName + "." + name;
    }

    public addPackage(packageName: string): void {
        const packages = packageName.split(".");
        this.addSubPackage(packages);
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

    public getNodeDataFromPackageTreeNode(nodeData: INodeData): INodeData {
        return {
            name: this.name,
            moduleName: nodeData.moduleName,
            path: nodeData.path,
            uri: null,
            kind: NodeKind.PackageRoot,
            children: null,
        };
    }

    private addSubPackage(packages: string[]): void {
        if (!packages.length) {
            this.isPackage = true;
            return;
        }
        const subPackageName = packages.shift();
        const childNode = this.childs.find((child) => child.name === subPackageName);
        if (childNode) {
            childNode.addSubPackage(packages);
        } else {
            const newNode = new PackageTreeNode(subPackageName, this.fullName);
            newNode.addSubPackage(packages);
            this.childs.push(newNode);
        }
    }
}
