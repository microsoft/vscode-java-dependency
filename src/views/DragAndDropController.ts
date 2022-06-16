// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import * as fse from "fs-extra";
import { DataTransfer, DataTransferItem, TreeDragAndDropController, Uri, window, workspace, WorkspaceEdit } from "vscode";
import { Explorer } from "../constants";
import { BaseSymbolNode } from "./baseSymbolNode";
import { ContainerNode, ContainerType } from "./containerNode";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { FileNode } from "./fileNode";
import { FolderNode } from "./folderNode";
import { explorerNodeCache } from "./nodeCache/explorerNodeCache";
import { PackageNode } from "./packageNode";
import { PackageRootNode } from "./packageRootNode";
import { PrimaryTypeNode } from "./PrimaryTypeNode";
import { ProjectNode } from "./projectNode";
import { WorkspaceNode } from "./workspaceNode";
import { addLibraryGlobs } from "../controllers/libraryController";
import { sendError } from "vscode-extension-telemetry-wrapper";

export class DragAndDropController implements TreeDragAndDropController<ExplorerNode> {

    dropMimeTypes: string[] = [
        Explorer.Mime.JavaProjectExplorer,
        Explorer.Mime.TextUriList,
    ];
    dragMimeTypes: string[] = [
        Explorer.Mime.TextUriList,
    ];

    public handleDrag(source: ExplorerNode[], treeDataTransfer: DataTransfer): void {
        // select many is not supported yet
        const dragItem = source[0];
        this.addDragToEditorDataTransfer(dragItem, treeDataTransfer);
        this.addInternalDragDataTransfer(dragItem, treeDataTransfer);
    }

    public async handleDrop(target: ExplorerNode | undefined, dataTransfer: DataTransfer): Promise<void> {
        const data = dataTransfer.get(Explorer.Mime.JavaProjectExplorer);
        if (data) {
            await this.dropFromJavaProjectExplorer(target, data.value);
            return;
        }

        let uriList: string[] = [];
        // an undefined value will be contained with the key 'text/uri-list', so here
        // we iterate all the entries to get the uri list.
        // see: https://github.com/microsoft/vscode/issues/152031
        dataTransfer.forEach((value: DataTransferItem, key: string) => {
            if (key === Explorer.Mime.TextUriList && value.value) {
                uriList.push(...(value.value as string).split("\n"));
            }
        });

        uriList = uriList.map(u => {
            try {
                const uri = Uri.parse(u, true /* strict */);
                if (uri.scheme !== "file") {
                    return undefined;
                }
                return u;
            } catch (e) {
                sendError(e);
                return undefined;
            }
        }).filter(Boolean) as string[];

        if (uriList.length) {
            this.dropFromFileExplorer(target, uriList);
        }
    }

    /**
     * Add data transfer that is used when node is dropped to the editor.
     * @param node node being dragged.
     * @param treeDataTransfer A map containing a mapping of the mime type of the corresponding transferred data.
     */
    private addDragToEditorDataTransfer(node: ExplorerNode, treeDataTransfer: DataTransfer) {
        if ((node instanceof PrimaryTypeNode || node instanceof FileNode) && node.uri) {
            treeDataTransfer.set(Explorer.Mime.TextUriList, new DataTransferItem(node.uri));
        } else if ((node instanceof BaseSymbolNode)) {
            const parent = (node.getParent() as PrimaryTypeNode);
            if (parent.uri) {
                const range = (node as BaseSymbolNode).range;
                const fragment = `#L${range.start.line + 1},${range.start.character + 1}`;
                const uri = parent.uri + fragment;
                treeDataTransfer.set(Explorer.Mime.TextUriList, new DataTransferItem(uri));
            }
        }
    }

    /**
     * Add data transfer that is used when node is dropped into other Java Project Explorer node.
     * @param node  node being dragged.
     * @param treeDataTransfer A map containing a mapping of the mime type of the corresponding transferred data.
     */
    private addInternalDragDataTransfer(node: ExplorerNode, treeDataTransfer: DataTransfer): void {
        // draggable node must have uri
        if (!(node instanceof DataNode) || !node.uri) {
            return;
        }

        // whether the node can be dropped will be check in handleDrop(...)
        treeDataTransfer.set(Explorer.Mime.JavaProjectExplorer, new DataTransferItem(node.uri));
    }

    /**
     * Handle the DnD event which comes from Java Project explorer itself.
     * @param target the drop node.
     * @param uri uri in the data transfer.
     */
    private async dropFromJavaProjectExplorer(target: ExplorerNode | undefined, uri: string): Promise<void> {
        const source: DataNode | undefined = explorerNodeCache.getDataNode(Uri.parse(uri));
        if (!this.isDraggableNode(source)) {
            return;
        }

        if (!this.isDroppableNode(target)) {
            return;
        }

        // check if the target node is source node itself or its parent.
        if (target?.isItselfOrAncestorOf(source, 1 /*levelToCheck*/)) {
            return;
        }

        if (target instanceof ContainerNode) {
            if (target.getContainerType() !== ContainerType.ReferencedLibrary
                    || !(target.getParent() as ProjectNode).isUnmanagedFolder()) {
                return;
            }

            this.addReferencedLibraries([source?.uri!]);
        } else if (target instanceof PackageRootNode || target instanceof PackageNode
                || target instanceof FolderNode) {
            await this.move(Uri.parse(source!.uri!), Uri.parse(target.uri!));
        }
    }

    /**
     * Handle the DnD event which comes from VS Code's file explorer or system file explorer.
     * @param target the drop node.
     * @param uris uris of the dragged files.
     */
    private async dropFromFileExplorer(target: ExplorerNode | undefined, uris: string[]): Promise<void> {
        if (!this.isDroppableNode(target)) {
            return;
        }

        if (target instanceof ContainerNode) {
            if (target.getContainerType() !== ContainerType.ReferencedLibrary
                    || !(target.getParent() as ProjectNode).isUnmanagedFolder()) {
                return;
            }

            this.addReferencedLibraries(uris);
        } else if (target instanceof PackageRootNode || target instanceof PackageNode
                || target instanceof FolderNode) {
            for (const uri of uris) {
                await this.copy(Uri.parse(uri), Uri.parse(target.uri!));
            }
        }
    }

    /**
     * Check whether the dragged node is draggable.
     * @param node the dragged node.
     */
    private isDraggableNode(node: DataNode | undefined): boolean {
        if (!node?.uri) {
            return false;
        }
        if (node instanceof WorkspaceNode || node instanceof ProjectNode
                || node instanceof PackageRootNode || node instanceof ContainerNode
                || node instanceof BaseSymbolNode) {
            return false;
        }

        return this.isUnderSourceRoot(node);
    }

    /**
     * Check whether the node is under source root.
     *
     * Note: There is one exception: The primary type directly under an unmanaged folder project,
     * in that case, `true` is returned.
     * @param node DataNode
     */
    private isUnderSourceRoot(node: DataNode): boolean {
        let parent = node.getParent();
        while (parent) {
            if (parent instanceof ContainerNode) {
                return false;
            }

            if (parent instanceof PackageRootNode) {
                return parent.isSourceRoot();
            }
            parent = parent.getParent();
        }
        return true;
    }

    /**
     * Check whether the node is able to be dropped.
     */
    private isDroppableNode(node: ExplorerNode | undefined): boolean {
        // drop to root is not supported yet
        if (!node) {
            return false;
        }

        if (node instanceof DataNode && !(node instanceof ContainerNode) && !node.uri) {
            return false;
        }

        if (node instanceof WorkspaceNode || node instanceof ProjectNode
                || node instanceof BaseSymbolNode) {
            return false;
        }

        let parent: ExplorerNode | undefined = node;
        while (parent) {
            if (parent instanceof ProjectNode) {
                return false;
            } else if (parent instanceof PackageRootNode) {
                return parent.isSourceRoot();
            } else if (parent instanceof ContainerNode) {
                if (parent.getContainerType() === ContainerType.ReferencedLibrary) {
                    return (parent.getParent() as ProjectNode).isUnmanagedFolder();
                }
                return false;
            }
            parent = parent.getParent();
        }
        return false;
    }

    /**
     * Trigger a workspace edit that move the source node into the target node.
     */
    private async move(sourceUri: Uri, targetUri: Uri): Promise<void> {
        if (sourceUri === targetUri) {
            return;
        }

        const newPath = path.join(targetUri.fsPath, path.basename(sourceUri.fsPath));
        const choice = await window.showInformationMessage(
            `Are you sure you want to move '${path.basename(sourceUri.fsPath)}' into '${path.basename(targetUri.fsPath)}'?`,
            { modal: true },
            "Move",
        );

        if (choice === "Move" && await this.confirmOverwrite(newPath)) {
            const edit = new WorkspaceEdit();
            edit.renameFile(sourceUri, Uri.file(newPath), { overwrite: true });
            await workspace.applyEdit(edit);
        }
    }

    /**
     * Copy the file from source uri to the target uri.
     */
     private async copy(sourceUri: Uri, targetUri: Uri): Promise<void> {
        if (sourceUri === targetUri) {
            return;
        }

        const newPath = path.join(targetUri.fsPath, path.basename(sourceUri.fsPath));
        if (await this.confirmOverwrite(newPath)) {
            await workspace.fs.copy(sourceUri, Uri.file(newPath), { overwrite: true });
        }
    }

    /**
     * Confirm the overwrite action when the target file already exists.
     * @param file the path of the target file.
     */
    private async confirmOverwrite(file: string): Promise<boolean> {
        if (await fse.pathExists(file)) {
            const name = path.basename(file);
            const ans = await window.showWarningMessage(
                `A file or folder with the name '${name}' already exists in the destination folder. Do you want to replace it?`,
                {
                    modal: true,
                    detail: "This action is irreversible!",
                },
                "Replace",
            );
            return ans === "Replace";
        }

        return true;
    }

    /**
     * Parse the input uri strings to pattern strings and set them to
     * the setting: 'java.project.referencedLibraries'.
     * @param uriStrings uri strings
     */
    private async addReferencedLibraries(uriStrings: string[]): Promise<void> {
        const pattern = (await Promise.all(uriStrings.map(async uriString => {
            try {
                const uri = Uri.parse(uriString, true /* strict */);
                if (uri.scheme !== "file") {
                    return undefined;
                }
                const isDirectory = (await fse.stat(uri.fsPath)).isDirectory();
                // only jars and folders can be dropped into referenced libraries.
                if (!isDirectory && path.extname(uri.fsPath) !== ".jar") {
                    return undefined;
                }
                const uriPath = workspace.asRelativePath(uri, false);
                return isDirectory ? uriPath + "/**/*.jar" : uriPath;
            } catch (e) {
                sendError(e);
                return undefined;
            }
        }))).filter(Boolean);

        if (pattern) {
            addLibraryGlobs(pattern as string[]);
        }
    }
}
