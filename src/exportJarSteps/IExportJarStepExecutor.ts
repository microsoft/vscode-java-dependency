// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { IStepMetadata } from "./IStepMetadata";
import { ExportJarStep } from "./utility";

export interface IExportJarStepExecutor {
    getNextStep(): ExportJarStep;
    execute(stepMetadata?: IStepMetadata): Promise<ExportJarStep>;
}
