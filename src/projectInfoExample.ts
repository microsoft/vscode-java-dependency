// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { Jdtls } from "./java/jdtls";

/**
 * Example function demonstrating how to use the getProjectInfo command
 * This will retrieve comprehensive project information including dependencies,
 * Java version, Maven/Gradle version, and other build configurations.
 * The data is returned as key-value pairs for flexibility.
 */
export async function showProjectInfo() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage("No workspace folder is open");
        return;
    }

    const projectUri = workspaceFolders[0].uri.toString();
    
    try {
        const projectInfo = await Jdtls.getProjectInfo(projectUri);
        
        if (!projectInfo) {
            vscode.window.showErrorMessage("Failed to retrieve project information");
            return;
        }

        // Display project information in an output channel
        const outputChannel = vscode.window.createOutputChannel("Java Project Info");
        outputChannel.clear();
        outputChannel.appendLine("=".repeat(80));
        outputChannel.appendLine("Java Project Information");
        outputChannel.appendLine("=".repeat(80));
        outputChannel.appendLine("");
        
        // Basic project info
        outputChannel.appendLine(`Project Name:       ${projectInfo.projectName || 'N/A'}`);
        outputChannel.appendLine(`Project Path:       ${projectInfo.projectPath || 'N/A'}`);
        outputChannel.appendLine(`Project Type:       ${projectInfo.projectType || 'N/A'}`);
        outputChannel.appendLine("");
        
        // Java version information
        outputChannel.appendLine("Java Configuration:");
        outputChannel.appendLine(`  Java Version:     ${projectInfo.javaVersion || 'N/A'}`);
        outputChannel.appendLine(`  Compliance Level: ${projectInfo.complianceLevel || 'N/A'}`);
        outputChannel.appendLine(`  Source Level:     ${projectInfo.sourceLevel || 'N/A'}`);
        outputChannel.appendLine(`  Target Level:     ${projectInfo.targetLevel || 'N/A'}`);
        outputChannel.appendLine("");
        
        // JVM information
        outputChannel.appendLine("JVM Information:");
        outputChannel.appendLine(`  VM Name:          ${projectInfo.vmName || 'N/A'}`);
        outputChannel.appendLine(`  VM Version:       ${projectInfo.vmVersion || 'N/A'}`);
        outputChannel.appendLine(`  VM Location:      ${projectInfo.vmLocation || 'N/A'}`);
        outputChannel.appendLine("");
        
        // Build tool version
        if (projectInfo.buildToolVersion) {
            outputChannel.appendLine(`Build Tool Version: ${projectInfo.projectType} ${projectInfo.buildToolVersion}`);
            outputChannel.appendLine("");
        }
        
        // Source roots
        if (projectInfo.sourceRoots && projectInfo.sourceRoots.length > 0) {
            outputChannel.appendLine("Source Roots:");
            projectInfo.sourceRoots.forEach(source => {
                outputChannel.appendLine(`  - ${source}`);
            });
            outputChannel.appendLine("");
        }
        
        // Output paths
        if (projectInfo.outputPaths && projectInfo.outputPaths.length > 0) {
            outputChannel.appendLine("Output Paths:");
            projectInfo.outputPaths.forEach(output => {
                outputChannel.appendLine(`  - ${output}`);
            });
            outputChannel.appendLine("");
        }
        
        // Dependencies
        if (projectInfo.dependencies && projectInfo.dependencies.length > 0) {
            outputChannel.appendLine(`Dependencies (${projectInfo.dependencies.length}):`);
            outputChannel.appendLine("-".repeat(80));
            
            // Group by type
            const byType = projectInfo.dependencies.reduce((acc, dep) => {
                if (!acc[dep.type]) {
                    acc[dep.type] = [];
                }
                acc[dep.type].push(dep);
                return acc;
            }, {} as Record<string, typeof projectInfo.dependencies>);
            
            for (const [type, deps] of Object.entries(byType)) {
                outputChannel.appendLine("");
                outputChannel.appendLine(`${type.toUpperCase()} (${deps.length}):`);
                deps.forEach(dep => {
                    const version = dep.version ? ` (${dep.version})` : '';
                    outputChannel.appendLine(`  - ${dep.name}${version}`);
                    if (dep.path && dep.path !== dep.name) {
                        outputChannel.appendLine(`    Path: ${dep.path}`);
                    }
                });
            }
        }
        
        outputChannel.appendLine("");
        outputChannel.appendLine("=".repeat(80));
        outputChannel.show();
        
        vscode.window.showInformationMessage(`Project info loaded: ${projectInfo.projectName || 'Unknown'}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Error retrieving project info: ${error}`);
    }
}

/**
 * Example function to get project info for a specific project URI
 */
export async function getProjectInfoForUri(projectUri: string): Promise<Jdtls.IProjectInfo | undefined> {
    return await Jdtls.getProjectInfo(projectUri);
}
