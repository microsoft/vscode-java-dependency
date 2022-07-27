// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { IStepMetadata } from "./IStepMetadata";

export interface IExportJarStepExecutor {
    execute(stepMetadata?: IStepMetadata): Promise<boolean>;
}
