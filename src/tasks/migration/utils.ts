// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from "fs-extra";
import * as path from "path";
import { Range, tasks, TextDocument, workspace, WorkspaceEdit } from "vscode";
import { DeprecatedExportJarTaskProvider } from "../../exportJarSteps/ExportJarTaskProvider";
import { contextManager } from "../../contextManager";
import { Context } from "../../constants";
import { CodeActionProvider } from "./CodeActionProvider";

export async function getTasksJsonPaths(): Promise<string[]> {
    const tasksJsonPaths = [];
    if (workspace.workspaceFolders?.length) {
        for (const folder of workspace.workspaceFolders) {
            const tasksJsonPath = path.join(folder.uri.fsPath, ".vscode", "tasks.json");
            if (await fse.pathExists(tasksJsonPath)) {
                tasksJsonPaths.push(tasksJsonPath);
            }
        }
    }
    return tasksJsonPaths;
}

export async function updateExportTaskType(document: TextDocument, range: Range): Promise<void> {
    const workspaceEdit = new WorkspaceEdit();
    workspaceEdit.replace(document.uri, range, CodeActionProvider.JAVA_BUILD_ARTIFACT_TYPE);
    await workspace.applyEdit(workspaceEdit);
    await document.save();
}

export async function setContextForDeprecatedTasks(): Promise<void> {
    await contextManager.setContextValue(Context.SHOW_DEPRECATED_TASKS, true);
    const deprecatedTasks = await tasks.fetchTasks({ type: DeprecatedExportJarTaskProvider.type });
    if (deprecatedTasks?.length) {
        return;
    }
    await contextManager.setContextValue(Context.SHOW_DEPRECATED_TASKS, false);
}
