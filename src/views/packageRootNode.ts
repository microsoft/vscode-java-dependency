// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ThemeIcon } from "vscode";
import { Explorer } from "../constants";
import { Jdtls } from "../java/jdtls";
import { INodeData, NodeKind } from "../java/nodeData";
import { IPackageRootNodeData, PackageRootKind } from "../java/packageRootNodeData";
import { Settings } from "../settings";
import { isTest } from "../utility";
import { ContainerNode } from "./containerNode";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { ProjectNode } from "./projectNode";
import { NodeFactory } from "./nodeFactory";

export class PackageRootNode extends DataNode {

    constructor(nodeData: INodeData, parent: DataNode, protected _project: ProjectNode) {
        super(nodeData, parent);
    }

    public isSourceRoot(): boolean {
        return (<IPackageRootNodeData>this.nodeData).entryKind === PackageRootKind.K_SOURCE;
    }

    protected async loadData(): Promise<INodeData[]> {
        return Jdtls.getPackageData({
            kind: NodeKind.PackageRoot,
            projectUri: this._project.nodeData.uri,
            rootPath: this.nodeData.path,
            handlerIdentifier: this.nodeData.handlerIdentifier,
            isHierarchicalView: Settings.isHierarchicalView(),
        });
    }

    protected createChildNodeList(): ExplorerNode[] {
        const result: (ExplorerNode | undefined)[] = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.nodeData.children.forEach((nodeData) => {
                result.push(NodeFactory.createNode(nodeData, this, this._project, this));
            });
        }
        return result.filter(<T>(n?: T): n is T => Boolean(n));
    }

    protected get description(): string | boolean | undefined {
        const data = <IPackageRootNodeData>this.nodeData;
        if (data.entryKind === PackageRootKind.K_BINARY) {
            return data.path;
        } else {
            return undefined;
        }
    }

    protected get contextValue(): string {
        const data = <IPackageRootNodeData>this.nodeData;
        let contextValue: string;
        if (data.entryKind === PackageRootKind.K_BINARY) {
            contextValue = Explorer.ContextValueType.Jar;
            const parent = <ContainerNode>this.getParent();
            if (parent.path?.startsWith("REFERENCED_LIBRARIES_PATH")) {
                contextValue += "+referencedLibrary";
            }
            return contextValue;
        } else {
            contextValue = Explorer.ContextValueType.PackageRoot;
            if (isTest(data)) {
                contextValue += "+test";
            }
            if (resourceRoots.includes(this._nodeData.name)) {
                // APIs in JDT does not have a consistent result telling whether a package root
                // is a source root or resource root, so we hard code some common resources root
                // here as a workaround.
                contextValue += "+resource";
            } else {
                contextValue += "+source";
            }
            if (this._project.nodeData.metaData?.MaxSourceVersion >= 16) {
                contextValue += "+allowRecord";
            }
            return contextValue;
        }
    }

    protected get iconPath(): ThemeIcon {
        const data = <IPackageRootNodeData>this.nodeData;
        if (data.moduleName || data.entryKind === PackageRootKind.K_SOURCE) {
            return new ThemeIcon("file-submodule");
        }
        // K_BINARY node
        return new ThemeIcon("file-zip");
    }
}

export const resourceRoots: string[] = ["src/main/resources", "src/test/resources"];
