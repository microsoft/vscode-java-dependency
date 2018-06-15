// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ContainerEntryKind, IContainerNodeData } from "../java/containerNodeData";
import { Jdtls } from "../java/jdtls";
import { INodeData, NodeKind } from "../java/nodeData";
import { Telemetry } from "../telemetry";
import { ContainerNode } from "./containerNode";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { PackageRootNode } from "./packageRootNode";

export class ProjectNode extends DataNode {

    constructor(nodeData: INodeData, parent: DataNode) {
        super(nodeData, parent);
    }

    protected loadData(): Thenable<INodeData[]> {
        let result: INodeData[] = [];
        return Jdtls.getPackageData({ kind: NodeKind.Project, projectUri: this.nodeData.uri }).then((res) => {
            if (!res) {
                Telemetry.sendEvent("get children of project node return undefined");
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
                            Telemetry.sendEvent("get children from container node return undefined");
                        }
                        result = result.concat(...rootPackages);
                        return result;
                    });
            } else {
                return result;
            }
        });
    }

    protected createChildNodeList(): ExplorerNode[] {

        const result = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.nodeData.children.forEach((data) => {
                if (data.kind === NodeKind.Container) {
                    result.push(new ContainerNode(data, this, this));
                } else if (data.kind === NodeKind.PackageRoot) {
                    result.push(new PackageRootNode(data, this, this));
                }
            });
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
