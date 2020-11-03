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
    classpaths?: IClasspath[];
    outputPath?: string;
    steps: ExportJarStep[];
}

export interface IClasspath {
    source: string;
    destination: string | undefined;
    isArtifact: boolean;
}
