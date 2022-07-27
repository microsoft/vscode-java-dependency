// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import * as vscode from "vscode";
import { DeprecatedExportJarTaskProvider, BuildArtifactTaskProvider } from "../BuildArtifactTaskProvider";

export class DiagnosticProvider implements vscode.Disposable {
    public static DIAGNOSTIC_SOURCE = "Project Manager for Java";
    public static DEPRECATED_TASK_TYPE_MESSAGE = `The type \"${DeprecatedExportJarTaskProvider.type}\" is deprecated, please use \"${BuildArtifactTaskProvider.exportJarType}\" instead.`;
    private diagnosticCollection: vscode.DiagnosticCollection;
    private disposables: vscode.Disposable[] = [];
    private refreshDiagnosticsTrigger: any;

    constructor() {
        this.refreshDiagnosticsTrigger = _.debounce(this.refreshDiagnostics, 500 /** ms */);
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection("migrateExportTask");
        this.disposables.push(this.diagnosticCollection);
        this.disposables.push(vscode.workspace.onDidChangeTextDocument(async (e: vscode.TextDocumentChangeEvent) => {
            if (path.basename(e.document.fileName) === "tasks.json") {
                this.refreshDiagnosticsTrigger(e.document.uri);
            }
        }));
        this.disposables.push(vscode.workspace.onDidOpenTextDocument(async (e: vscode.TextDocument) => {
            if (path.basename(e.fileName) === "tasks.json") {
                this.refreshDiagnosticsTrigger(e.uri);
            }
        }));
        this.disposables.push(vscode.workspace.onDidCloseTextDocument(async (e: vscode.TextDocument) => {
            if (path.basename(e.fileName) === "tasks.json") {
                this.diagnosticCollection.set(e.uri, undefined);
            }
        }));
    }

    public dispose() {
        for (const d of this.disposables) {
            d.dispose();
        }
    }

    private async refreshDiagnostics(uri: vscode.Uri): Promise<void> {
        const diagnostics: vscode.Diagnostic[] = await DiagnosticProvider.getDiagnosticsFromTasksJsonPath(uri.fsPath);
        this.diagnosticCollection.set(uri, diagnostics);
    }

    private static async getDiagnosticsFromTasksJsonPath(tasksJsonPath: string): Promise<vscode.Diagnostic[]> {
        const diagnostics: vscode.Diagnostic[] = [];
        const fileStream = fs.createReadStream(tasksJsonPath);
        let lineNumber = 0;
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        for await (const line of rl) {
            const regExp: RegExp = /\"type\":\s*\"java\"/g;
            const result: RegExpMatchArray | null = line.match(regExp);
            if (result?.length === 1) {
                const matchString = result[0];
                const columnNumber = line.indexOf(matchString);
                if (columnNumber > -1) {
                    const diagnostic = new vscode.Diagnostic(
                        new vscode.Range(
                            new vscode.Position(lineNumber, columnNumber),
                            new vscode.Position(lineNumber, columnNumber + matchString.length)
                        ),
                        DiagnosticProvider.DEPRECATED_TASK_TYPE_MESSAGE,
                        vscode.DiagnosticSeverity.Warning
                    );
                    diagnostic.source = DiagnosticProvider.DIAGNOSTIC_SOURCE;
                    diagnostics.push(diagnostic);
                }
            }
            lineNumber++;
        }
        return diagnostics;
    }
}
