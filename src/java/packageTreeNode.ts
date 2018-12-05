// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { INodeData, NodeKind } from "./nodeData";

export class PackageTreeNode {
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
}
