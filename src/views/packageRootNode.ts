// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ThemeIcon } from "vscode";
import { Explorer } from "../constants";
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

    protected async loadData(): Promise<INodeData[]> {
        return Jdtls.getPackageData({
            kind: NodeKind.PackageRoot,
            projectUri: this._project.nodeData.uri,
            rootPath: this.nodeData.path,
            handlerIdentifier: this.nodeData.handlerIdentifier,
        });
    }

    protected createChildNodeList(): ExplorerNode[] {
        const result: ExplorerNode[] = [];
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
        if (data.entryKind === PackageRootKind.K_BINARY) {
            let contextValue: string = Explorer.ContextValueType.Jar;
            const parent = <ContainerNode>this.getParent();
            if (parent.path?.startsWith("REFERENCED_LIBRARIES_PATH")) {
                contextValue += "+referencedLibrary";
            }
            return contextValue;
        } else if (resourceRoots.includes(this._nodeData.name)) {
            // APIs in JDT does not have a consistent result telling whether a package root
            // is a source root or resource root, so we hard code some common resources root
            // here as a workaround.
            return `${Explorer.ContextValueType.PackageRoot}+resource`;
        } else {
            return `${Explorer.ContextValueType.PackageRoot}+source`;
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

const resourceRoots: string[] = ["src/main/resources", "src/test/resources"];
