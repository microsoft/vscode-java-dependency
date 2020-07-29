// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { GenerateSettings } from "../exportJarFileCommand";

export interface IStep {
    exportStep: ExportSteps;
    execute(lastStep: IStep | undefined, generateSettings: GenerateSettings): Promise<ExportSteps>;
}

export enum ExportSteps {
    ResolveWorkspace = "RESOLVEWORKSPACE",
    ResolveMainMethod = "RESOLVEMAINMETHOD",
    GenerateJar = "GENERATEJAR",
    Finish = "FINISH",
}
