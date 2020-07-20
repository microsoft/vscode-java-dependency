// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.
import * as commands from "./commands";

export enum CompileWorkspaceStatus {
    FAILED = 0,
    SUCCEED = 1,
    WITHERROR = 2,
    CANCELLED = 3,
}

export function resolveBuildFiles(): Promise<string[]> {
    return <Promise<string[]>>commands.executeJavaLanguageServerCommand(commands.JAVA_RESOLVE_BUILD_FILES);
}
