// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.
import * as commands from "./commands";

export enum CompileWorkspaceStatus {
    Failed = 0,
    Succeed = 1,
    Witherror = 2,
    Cancelled = 3,
}

export function resolveBuildFiles(): Promise<string[]> {
    return <Promise<string[]>>commands.executeJavaLanguageServerCommand(commands.JAVA_RESOLVE_BUILD_FILES);
}
