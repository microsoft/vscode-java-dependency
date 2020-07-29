// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { StepMetadata } from "../exportJarFileCommand";

export interface IStep {
    execute(stepMetadata?: StepMetadata): Promise<IStep | undefined>;
}
