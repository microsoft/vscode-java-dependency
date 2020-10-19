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
    elements?: string[];
    classpaths?: IClassPath[];
    outputPath?: string;
    steps: ExportJarStep[];
}

export interface IClassPath {
    source: string;
    destination: string | undefined;
    isExtract: boolean;
}
