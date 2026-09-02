// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as minimatch from "minimatch";
import * as path from "path";
import { FileType, ThemeIcon, Uri, workspace } from "vscode";
import { Explorer } from "../constants";
import { INodeData, NodeKind } from "../java/nodeData";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { FileNode } from "./fileNode";

interface IFilesExclude {
    [pattern: string]: boolean;
}

export async function getWorkspaceResourceData(directoryUri: Uri, workspaceFolderUri: Uri): Promise<INodeData[]> {
    const entries = await workspace.fs.readDirectory(directoryUri);
    const excludePatterns = workspace.getConfiguration("files", workspaceFolderUri)
        .get<IFilesExclude>("exclude", {});

    return entries
        .map(([name, fileType]) => {
            const uri = Uri.joinPath(directoryUri, name);
            const relativePath = path.posix.relative(workspaceFolderUri.path, uri.path);
            // VS Code's FileType is a bit mask, so symbolic-link directories can include both flags.
            // tslint:disable-next-line:no-bitwise
            const kind = (fileType & FileType.Directory) !== 0 ? NodeKind.Folder : NodeKind.File;
            const nodeData: INodeData = {
                name,
                path: relativePath,
                uri: uri.toString(),
                kind,
            };
            return {
                nodeData,
                relativePath,
            };
        })
        .filter(({ relativePath }) => !isExcluded(relativePath, excludePatterns))
        .map(({ nodeData }) => nodeData);
}

export function createWorkspaceResourceNode(
    nodeData: INodeData,
    parent: DataNode,
    workspaceFolderUri: Uri,
): ExplorerNode {
    switch (nodeData.kind) {
        case NodeKind.Folder:
            return new WorkspaceResourceFolderNode(nodeData, parent, workspaceFolderUri);
        case NodeKind.File:
            return new FileNode(nodeData, parent);
        default:
            throw new Error(`Unsupported workspace resource kind: ${nodeData.kind}`);
    }
}

class WorkspaceResourceFolderNode extends DataNode {
    constructor(nodeData: INodeData, parent: DataNode, private readonly workspaceFolderUri: Uri) {
        super(nodeData, parent);
    }

    protected async loadData(): Promise<INodeData[]> {
        if (!this.uri) {
            return [];
        }
        return getWorkspaceResourceData(Uri.parse(this.uri), this.workspaceFolderUri);
    }

    protected createChildNodeList(): ExplorerNode[] {
        return (this.nodeData.children || []).map((nodeData) =>
            createWorkspaceResourceNode(nodeData, this, this.workspaceFolderUri));
    }

    protected get iconPath(): ThemeIcon {
        return ThemeIcon.Folder;
    }

    protected get contextValue(): string {
        return Explorer.ContextValueType.Folder;
    }
}

function isExcluded(relativePath: string, excludePatterns: IFilesExclude): boolean {
    return Object.entries(excludePatterns).some(([pattern, enabled]) =>
        enabled && minimatch.match([relativePath], pattern, { dot: true }).length > 0);
}
