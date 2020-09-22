// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Uri } from "vscode";
import { ExportJarStep } from "../exportJarFileCommand";
import { INodeData } from "../java/nodeData";

export interface IStepMetadata {
    entry?: INodeData;
    workspaceUri?: Uri;
    projectList?: INodeData[];
    selectedMainMethod?: string;
    outputPath?: string;
    elements: string[];
    steps: ExportJarStep[];
}
