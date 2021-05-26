// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { WorkspaceFolder } from "vscode";
import { INodeData } from "../java/nodeData";
import { ExportJarStep } from "./utility";

export interface IStepMetadata {
    entry?: INodeData;
    taskLabel: string;
    terminalId?: string;
    workspaceFolder?: WorkspaceFolder;
    mainClass?: string;
    outputPath?: string;
    projectList: INodeData[];
    elements: string[];
    classpaths: IClasspath[];
    steps: ExportJarStep[];
}

export interface IClasspath {
    source: string;
    destination: string | undefined;
    isArtifact: boolean;
}
