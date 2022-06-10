// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { DataTransfer, DataTransferItem, TreeDragAndDropController } from "vscode";
import { Explorer } from "../constants";
import { BaseSymbolNode } from "./baseSymbolNode";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { FileNode } from "./fileNode";
import { PrimaryTypeNode } from "./PrimaryTypeNode";

export class DragAndDropController implements TreeDragAndDropController<ExplorerNode> {

    dropMimeTypes: string[] = [
        Explorer.Mime.JavaProjectExplorer,
    ];
    dragMimeTypes: string[] = [
        Explorer.Mime.TextUriList,
    ];;

    public handleDrag(source: ExplorerNode[], treeDataTransfer: DataTransfer): void {
        // select many is not supported yet
        let dragItem = source[0];
        this.addDragToEditorDataTransfer(dragItem, treeDataTransfer);
    }

    private addDragToEditorDataTransfer(node: ExplorerNode, treeDataTransfer: DataTransfer) {
        if ((node instanceof PrimaryTypeNode || node instanceof FileNode) && (node as DataNode).uri) {
            treeDataTransfer.set(Explorer.Mime.TextUriList, new DataTransferItem((node as DataNode).uri));
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
}
