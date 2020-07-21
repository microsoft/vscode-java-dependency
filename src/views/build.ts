// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { basename } from "path";
import { commands, DiagnosticSeverity, languages, Uri, window } from "vscode";
import { instrumentOperation, sendInfo, sendOperationError, setErrorCode } from "vscode-extension-telemetry-wrapper";
import { executeJavaExtensionCommand, JAVA_BUILD_WORKSPACE } from "../commands";
import { CompileWorkspaceStatus, resolveBuildFiles } from "../java/jdtls";
import { UserError } from "../utility";

export async function buildWorkspace(): Promise<boolean> {
    const buildResult = await instrumentOperation("build", async (operationId: string) => {
        let error;
        try {
            await executeJavaExtensionCommand(JAVA_BUILD_WORKSPACE, false);
        } catch (err) {
            error = err;
        }

        return {
            error,
            operationId,
        };
    })();

    if (buildResult.error) {
        return handleBuildFailure(buildResult.operationId, buildResult.error);
    }
    return true;
}

async function handleBuildFailure(operationId: string, err: any): Promise<boolean> {

    const error: Error = new UserError({
        message: "Build failed",
    });
    setErrorCode(error, Number(err));
    sendOperationError(operationId, "build", error);
    if (err === CompileWorkspaceStatus.Witherror || err === CompileWorkspaceStatus.Failed) {
        if (checkErrorsReportedByJavaExtension()) {
            commands.executeCommand("workbench.actions.view.problems");
        }

        const ans = await window.showErrorMessage("Build failed, do you want to continue?",
            "Proceed", "Fix...", "Cancel");
        sendInfo(operationId, {
            operationName: "build",
            choiceForBuildError: ans || "esc",
        });
        if (ans === "Proceed") {
            return true;
        } else if (ans === "Fix...") {
            showFixSuggestions(operationId);
        }
        return false;
    }
    return false;
}

function checkErrorsReportedByJavaExtension(): boolean {
    const problems = languages.getDiagnostics() || [];
    for (const problem of problems) {
        const fileName = basename(problem[0].fsPath || "");
        if (fileName.endsWith(".java") || fileName === "pom.xml" || fileName.endsWith(".gradle")) {
            if (problem[1].filter((diagnostic) => diagnostic.severity === DiagnosticSeverity.Error).length) {
                return true;
            }
        }
    }
    return false;
}

async function showFixSuggestions(operationId: string) {
    let buildFiles = [];
    try {
        buildFiles = await resolveBuildFiles();
    } catch (error) {
        // do nothing
    }

    const pickitems = [];
    pickitems.push({
        label: "Clean workspace cache",
        detail: "Clean the stale workspace and reload the window",
    });
    if (buildFiles.length) {
        pickitems.push({
            label: "Update project configuration",
            detail: "Force the language server to update the project configuration/classpath",
        });
    }
    pickitems.push({
        label: "Open log file",
        detail: "Open log file to view more details for the build errors",
    });

    const ans = await window.showQuickPick(pickitems, {
        placeHolder: "Please fix the errors in PROBLEMS first, then try the fix suggestions below.",
    });
    sendInfo(operationId, {
        operationName: "build",
        choiceForBuildFix: ans ? ans.label : "esc",
    });
    if (!ans) {
        return;
    }

    if (ans.label === "Clean workspace cache") {
        commands.executeCommand("java.clean.workspace");
    } else if (ans.label === "Update project configuration") {
        for (const buildFile of buildFiles) {
            await commands.executeCommand("java.projectConfiguration.update", Uri.parse(buildFile));
        }
    } else if (ans.label === "Open log file") {
        commands.executeCommand("java.open.serverLog");
    }
}
