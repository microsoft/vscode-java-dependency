// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ExportJarStep } from "../exportJarFileCommand";
import { IStepMetadata } from "./IStepMetadata";

export interface IExportJarStepExecutor {
    getNextStep(): ExportJarStep;
    execute(stepMetadata?: IStepMetadata): Promise<ExportJarStep>;
}
