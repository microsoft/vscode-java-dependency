// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { Jdtls } from "../java/jdtls";

/**
 * Command to get project information and display it with execution time
 */
export async function getProjectInfoCommand(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage("No workspace folder is open");
        return;
    }

    const projectUri = workspaceFolders[0].uri.toString();
    
    // Create output channel for results
    const outputChannel = vscode.window.createOutputChannel("Java Project Info");
    outputChannel.clear();
    outputChannel.show();

    outputChannel.appendLine("=".repeat(80));
    outputChannel.appendLine("Executing: java.project.getProjectInfo");
    outputChannel.appendLine(`Project URI: ${projectUri}`);
    outputChannel.appendLine("=".repeat(80));
    outputChannel.appendLine("");

    // Measure execution time
    const startTime = Date.now();
    
    try {
        outputChannel.appendLine(`Start time: ${new Date(startTime).toISOString()}`);
        outputChannel.appendLine("Executing command...");
        outputChannel.appendLine("");

        // Execute the command
        const projectInfo = await Jdtls.getProjectInfo(projectUri);
        
        const endTime = Date.now();
        const executionTime = endTime - startTime;

        // Display execution time
        outputChannel.appendLine("=".repeat(80));
        outputChannel.appendLine(`✓ Command completed successfully`);
        outputChannel.appendLine(`Execution Time: ${executionTime} ms (${(executionTime / 1000).toFixed(2)} seconds)`);
        outputChannel.appendLine(`End time: ${new Date(endTime).toISOString()}`);
        outputChannel.appendLine("=".repeat(80));
        outputChannel.appendLine("");

        if (!projectInfo) {
            outputChannel.appendLine("⚠ No project information returned (project may not be a Java project)");
            vscode.window.showWarningMessage("No project information available");
            return;
        }

        // Display the results as formatted JSON
        outputChannel.appendLine("PROJECT INFORMATION:");
        outputChannel.appendLine("-".repeat(80));
        outputChannel.appendLine("");
        outputChannel.appendLine(JSON.stringify(projectInfo, null, 2));
        outputChannel.appendLine("");
        outputChannel.appendLine("-".repeat(80));

        // Display summary
        outputChannel.appendLine("");
        outputChannel.appendLine("SUMMARY:");
        outputChannel.appendLine(`  Project Name: ${projectInfo.projectName || 'N/A'}`);
        outputChannel.appendLine(`  Project Type: ${projectInfo.projectType || 'N/A'}`);
        outputChannel.appendLine(`  Java Version: ${projectInfo.javaVersion || 'N/A'}`);
        
        if (projectInfo.dependencies) {
            outputChannel.appendLine(`  Dependencies: ${projectInfo.dependencies.length}`);
            
            // Count by type
            const byType = projectInfo.dependencies.reduce((acc, dep) => {
                acc[dep.type] = (acc[dep.type] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            
            for (const [type, count] of Object.entries(byType)) {
                outputChannel.appendLine(`    - ${type}: ${count}`);
            }
        }
        
        if (projectInfo.sourceRoots) {
            outputChannel.appendLine(`  Source Roots: ${projectInfo.sourceRoots.length}`);
        }
        
        if (projectInfo.outputPaths) {
            outputChannel.appendLine(`  Output Paths: ${projectInfo.outputPaths.length}`);
        }

        outputChannel.appendLine("");
        outputChannel.appendLine("=".repeat(80));

        // Show success message with execution time
        vscode.window.showInformationMessage(
            `Project info retrieved in ${executionTime}ms: ${projectInfo.projectName || 'Unknown'}`
        );

    } catch (error) {
        const endTime = Date.now();
        const executionTime = endTime - startTime;

        outputChannel.appendLine("");
        outputChannel.appendLine("=".repeat(80));
        outputChannel.appendLine(`✗ Command failed`);
        outputChannel.appendLine(`Execution Time: ${executionTime} ms`);
        outputChannel.appendLine(`End time: ${new Date(endTime).toISOString()}`);
        outputChannel.appendLine("=".repeat(80));
        outputChannel.appendLine("");
        outputChannel.appendLine("ERROR:");
        outputChannel.appendLine(String(error));
        
        if (error instanceof Error && error.stack) {
            outputChannel.appendLine("");
            outputChannel.appendLine("STACK TRACE:");
            outputChannel.appendLine(error.stack);
        }

        vscode.window.showErrorMessage(`Failed to retrieve project info: ${error}`);
    }
}
