import { ExplorerNode } from "./explorerNode";
import { DataNode } from "./dataNode";
import { TreeItem, TreeItemCollapsibleState } from "vscode";
import { INodeData, NodeKind } from "../java/nodeData";
import { Jdtls } from "../java/jdtls";
import { ContainerNode } from "./containerNode";
import { PackageRootNode } from "./packageRootNode";
import { IContainerNodeData, ContainerEntryKind } from "../java/containerNodeData";

export class ProjectNode extends DataNode {

    constructor(nodeData: INodeData) {
        super(nodeData);
    }

    protected loadData(): Thenable<INodeData[]> {
        let result: INodeData[] = [];
        return Jdtls.getPackageData({ kind: NodeKind.Project, projectUri: this.nodeData.uri }).then((res) => {
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
                return Promise.all(sourceContainer.map(c => Jdtls.getPackageData({ kind: NodeKind.Container, projectUri: this.uri, path: c.path })))
                    .then((rootPackages) => {
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
                    result.push(new ContainerNode(data, this));
                } else if (data.kind === NodeKind.PackageRoot) {
                    result.push(new PackageRootNode(data, this));
                }
            });
        }
        return result;
    }

    protected get iconPath(): string {
        return "./images/project.gif";
    }
}
