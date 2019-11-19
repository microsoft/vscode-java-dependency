// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ContainerEntryKind, IContainerNodeData } from "../java/containerNodeData";
import { Jdtls } from "../java/jdtls";
import { INodeData, NodeKind } from "../java/nodeData";
import { ContainerNode } from "./containerNode";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { NodeFactory } from "./nodeFactory";

export class ProjectNode extends DataNode {

    constructor(nodeData: INodeData, parent: DataNode) {
        super(nodeData, parent);
    }

    protected loadData(): Thenable<INodeData[]> {
        let result: INodeData[] = [];
        return Jdtls.getPackageData({ kind: NodeKind.Project, projectUri: this.nodeData.uri }).then((res) => {
            if (!res) {
                return;
            }
            const sourceContainer: IContainerNodeData[] = [];
            res.forEach((node) => {
                const containerNode = <IContainerNodeData>node;
                if (containerNode.entryKind === ContainerEntryKind.CPE_SOURCE) {
                    sourceContainer.push(containerNode);
                } else {
                    result.push(node);
                }
            });
            if (sourceContainer.length > 0) {
                return Promise.all(sourceContainer.map((c) => Jdtls.getPackageData({ kind: NodeKind.Container, projectUri: this.uri, path: c.path })))
                    .then((rootPackages) => {
                        if (!rootPackages) {
                            return;
                        }
                        result = result.concat(...rootPackages);
                        return result;
                    });
            } else {
                return result;
            }
        });
    }

    protected async createChildNodeList(): Promise<ExplorerNode[]> {
        const result = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            for (const data of this.nodeData.children) {
                if (data.kind === NodeKind.Container) {
                    result.push(new ContainerNode(data, this, this));
                } else if (data.kind === NodeKind.PackageRoot) {
                    const node = NodeFactory.createPackageRootNode(data, this, this);
                    if (!data.name) { // Extract the nodes of empty-name packge root out
                        for (const child of await node.getChildren()) {
                            child.setParent(this);
                            result.push(child);
                        }
                    } else {
                        result.push(node);
                    }
                }
            }
        }

        result.sort((a: DataNode, b: DataNode) => {
            return b.nodeData.kind - a.nodeData.kind;
        });

        return result;
    }

    protected get iconPath(): { light: string; dark: string } {
        return ExplorerNode.resolveIconPath("project");
    }
}
