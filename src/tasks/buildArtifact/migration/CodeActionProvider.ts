// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { Commands } from "../../../commands";
import { BuildArtifactTaskProvider } from "../BuildArtifactTaskProvider";
import { DiagnosticProvider } from "./DiagnosticProvider";

export class CodeActionProvider implements vscode.CodeActionProvider {

    public static JAVA_UPDATE_DEPRECATED_TASK_TITLE = `Change to \"${BuildArtifactTaskProvider.exportJarType}\"`;
    public static JAVA_BUILD_ARTIFACT_TYPE = `"type": "${BuildArtifactTaskProvider.exportJarType}"`;

    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection,
                              _context: vscode.CodeActionContext, _token: vscode.CancellationToken): vscode.CodeAction[] | undefined {
        const diagnostics = vscode.languages.getDiagnostics(document.uri);
        if (diagnostics?.length) {
            for (const diagnostic of diagnostics) {
                if (diagnostic.source !== DiagnosticProvider.DIAGNOSTIC_SOURCE) {
                    continue;
                }
                if (diagnostic.range.contains(range)) {
                    const updateTaskCommand: vscode.Command = {
                        command: Commands.JAVA_UPDATE_DEPRECATED_TASK,
                        title: CodeActionProvider.JAVA_UPDATE_DEPRECATED_TASK_TITLE,
                        arguments: [
                            document,
                            diagnostic.range
                        ]
                    };
                    return [{
                        title: CodeActionProvider.JAVA_UPDATE_DEPRECATED_TASK_TITLE,
                        kind: vscode.CodeActionKind.QuickFix,
                        command: updateTaskCommand
                    }];
                }
            }
        }
        return [];
    }
}
