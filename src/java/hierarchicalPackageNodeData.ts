// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { INodeData, NodeKind } from "./nodeData";

export class HierarchicalPackageNodeData implements INodeData {

    public static createHierarchicalNodeDataByPackageList(packageList: INodeData[]): HierarchicalPackageNodeData {
        const result = new HierarchicalPackageNodeData("", "");
        packageList.forEach((nodeData) => result.addSubPackage(nodeData.name.split("."), nodeData));
        result.compressTree();
        return result;
    }

    public name: string;
    public children = [];
    public displayName: string;
    private nodeData: INodeData = null;

    public get uri() {
        return this.nodeData && this.nodeData.uri;
    }

    public get moduleName() {
        return this.nodeData && this.nodeData.moduleName;
    }

    public get path() {
        return this.nodeData && this.nodeData.path;
    }

    public get kind() {
        return this.nodeData ? this.nodeData.kind : NodeKind.Package;
    }

    public get isPackage() {
        return this.nodeData !== null;
    }

    public get handlerIdentifier() {
        return this.nodeData.handlerIdentifier;
    }

    private constructor(displayName: string, parentName: string) {
        this.displayName = displayName;
        this.name = parentName === "" ? displayName : parentName + "." + displayName;
    }

    private compressTree(): void {
        // Don't compress the root node
        while (this.name !== "" && this.children.length === 1 && !this.isPackage) {
            const child = this.children[0];
            this.name = this.name + "." + child.displayName;
            this.displayName = this.displayName + "." + child.displayName;
            this.children = child.children;
            this.nodeData = child.nodeData;
        }
        this.children.forEach((child) => child.compressTree());
    }

    private addSubPackage(packages: string[], nodeData: INodeData): void {
        if (!packages.length) {
            this.nodeData = nodeData;
            return;
        }
        const subPackageDisplayName = packages.shift();
        const childNode = this.children.find((child) => child.displayName === subPackageDisplayName);
        if (childNode) {
            childNode.addSubPackage(packages, nodeData);
        } else {
            const newNode = new HierarchicalPackageNodeData(subPackageDisplayName, this.name);
            newNode.addSubPackage(packages, nodeData);
            this.children.push(newNode);
        }
    }
}
