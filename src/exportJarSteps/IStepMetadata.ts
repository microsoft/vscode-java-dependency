// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { WorkspaceFolder } from "vscode";
import { ExportJarStep } from "../exportJarFileCommand";
import { INodeData } from "../java/nodeData";

export interface IStepMetadata {
    entry?: INodeData;
    workspaceFolder?: WorkspaceFolder;
    projectList?: INodeData[];
    mainMethod?: string;
    outputPath?: string;
    elements?: string[];
    steps: ExportJarStep[];
}
