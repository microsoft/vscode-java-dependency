// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, Uri, CancellationToken } from "vscode";
import { sendError } from "vscode-extension-telemetry-wrapper";
import { GetImportClassContentError, GetProjectDependenciesError } from "./utils";

export interface INodeImportClass {
    uri: string;
    value: string;  // Changed from 'class' to 'className' to match Java code
}

export interface IImportClassContentResult {
    classInfoList: INodeImportClass[];
    emptyReason?: string;
    isEmpty: boolean;
}

export interface IProjectDependency {
    [key: string]: string;
}

export interface IProjectDependenciesResult {
    dependencyInfoList: Array<{ key: string; value: string }>;
    emptyReason?: string;
    isEmpty: boolean;
}
/**
 * Helper class for Copilot integration to analyze Java project dependencies
 */
export namespace CopilotHelper {
    /**
     * Resolves all local project types imported by the given file (backward compatibility version)
     * @param fileUri The URI of the Java file to analyze
     * @param cancellationToken Optional cancellation token to abort the operation
     * @returns Array of import class information
     */
    export async function resolveLocalImports(fileUri: Uri, cancellationToken?: CancellationToken): Promise<INodeImportClass[]> {
        const result = await resolveLocalImportsWithReason(fileUri, cancellationToken);
        return result.classInfoList;
    }

    /**
     * Resolves all local project types imported by the given file with detailed error reporting
     * @param fileUri The URI of the Java file to analyze
     * @param cancellationToken Optional cancellation token to abort the operation
     * @returns Result object containing import class information and error details
     */
    export async function resolveLocalImportsWithReason(fileUri: Uri, cancellationToken?: CancellationToken): Promise<IImportClassContentResult> {
        if (cancellationToken?.isCancellationRequested) {
            return {
                classInfoList: [],
                emptyReason: "CopilotCancelled",
                isEmpty: true
            };
        }

        try {
            // Use the new command with error reason support
            const commandPromise = commands.executeCommand("java.execute.workspaceCommand", "java.project.getImportClassContent", fileUri.toString()) as Promise<IImportClassContentResult>;
            
            if (cancellationToken) {
                const result = await Promise.race([
                    commandPromise,
                    new Promise<IImportClassContentResult>((_, reject) => {
                        cancellationToken.onCancellationRequested(() => {
                            reject(new Error('Operation cancelled'));
                        });
                    }),
                    new Promise<IImportClassContentResult>((_, reject) => {
                        setTimeout(() => {
                            reject(new Error('Operation timed out'));
                        }, 80); // 80ms timeout
                    })
                ]);
                
                if (!result) {
                    return {
                        classInfoList: [],
                        emptyReason: "CommandNullResult",
                        isEmpty: true
                    };
                }
                
                return result;
            } else {
                const result = await Promise.race([
                    commandPromise,
                    new Promise<IImportClassContentResult>((_, reject) => {
                        setTimeout(() => {
                            reject(new Error('Operation timed out'));
                        }, 80); // 80ms timeout
                    })
                ]);
                
                if (!result) {
                    return {
                        classInfoList: [],
                        emptyReason: "CommandNullResult",
                        isEmpty: true
                    };
                }
                
                return result;
            }
        } catch (error: any) {
            if (error.message === 'Operation cancelled') {
                return {
                    classInfoList: [],
                    emptyReason: "CopilotCancelled",
                    isEmpty: true
                };
            }
            
            if (error.message === 'Operation timed out') {
                return {
                    classInfoList: [],
                    emptyReason: "Timeout",
                    isEmpty: true
                };
            }
            
            const errorMessage = 'TsException_' + ((error as Error).message || "unknown");
            sendError(new GetImportClassContentError(errorMessage));
            return {
                classInfoList: [],
                emptyReason: errorMessage,
                isEmpty: true
            };
        }
    }

    /**
     * Resolves project dependencies for the given project URI (backward compatibility version)
     * @param projectUri The URI of the Java project to analyze
     * @param cancellationToken Optional cancellation token to abort the operation
     * @returns Object containing project dependencies as key-value pairs
     */
    export async function resolveProjectDependencies(projectUri: Uri, cancellationToken?: CancellationToken): Promise<IProjectDependency> {
        const result = await resolveProjectDependenciesWithReason(projectUri, cancellationToken);
        
        // Convert to legacy format
        const dependencies: IProjectDependency = {};
        for (const dep of result.dependencyInfoList) {
            dependencies[dep.key] = dep.value;
        }
        
        return dependencies;
    }

    /**
     * Resolves project dependencies with detailed error reporting
     * @param projectUri The URI of the Java project to analyze
     * @param cancellationToken Optional cancellation token to abort the operation
     * @returns Result object containing project dependencies and error information
     */
    export async function resolveProjectDependenciesWithReason(projectUri: Uri, cancellationToken?: CancellationToken): Promise<IProjectDependenciesResult> {
        if (cancellationToken?.isCancellationRequested) {
            return {
                dependencyInfoList: [],
                emptyReason: "CopilotCancelled",
                isEmpty: true
            };
        }

        try {
            // Use the new command with error reason support
            const commandPromise = commands.executeCommand("java.execute.workspaceCommand", "java.project.getDependencies", projectUri.toString()) as Promise<IProjectDependenciesResult>;
            
            if (cancellationToken) {
                const result = await Promise.race([
                    commandPromise,
                    new Promise<IProjectDependenciesResult>((_, reject) => {
                        cancellationToken.onCancellationRequested(() => {
                            reject(new Error('Operation cancelled'));
                        });
                    }),
                    new Promise<IProjectDependenciesResult>((_, reject) => {
                        setTimeout(() => {
                            reject(new Error('Operation timed out'));
                        }, 40); // 40ms timeout
                    })
                ]);
                
                if (!result) {
                    return {
                        dependencyInfoList: [],
                        emptyReason: "CommandNullResult",
                        isEmpty: true
                    };
                }
                
                return result;
            } else {
                const result = await Promise.race([
                    commandPromise,
                    new Promise<IProjectDependenciesResult>((_, reject) => {
                        setTimeout(() => {
                            reject(new Error('Operation timed out'));
                        }, 40); // 40ms timeout
                    })
                ]);
                
                if (!result) {
                    return {
                        dependencyInfoList: [],
                        emptyReason: "CommandNullResult",
                        isEmpty: true
                    };
                }
                
                return result;
            }
        } catch (error: any) {
            if (error.message === 'Operation cancelled') {
                return {
                    dependencyInfoList: [],
                    emptyReason: 'CopilotCancelled',
                    isEmpty: true
                };
            }
            
            if (error.message === 'Operation timed out') {
                return {
                    dependencyInfoList: [],
                    emptyReason: "Timeout",
                    isEmpty: true
                };
            }
            
            const errorMessage = 'TsException_' + ((error as Error).message || "unknown");
            sendError(new GetProjectDependenciesError(errorMessage));
            return {
                dependencyInfoList: [],
                emptyReason: errorMessage,
                isEmpty: true
            };
        }
    }

    /**
     * Resolves project dependencies and converts them to context items with cancellation support
     * @param workspaceFolders The workspace folders, or undefined if none
     * @param copilotCancel Cancellation token from Copilot
     * @param checkCancellation Function to check for cancellation
     * @param sendTelemetry Function to send telemetry data
     * @returns Array of context items for project dependencies, or empty array if no workspace folders
     */
    export async function resolveAndConvertProjectDependencies(
        workspaceFolders: readonly { uri: Uri }[] | undefined,
        copilotCancel: CancellationToken,
        checkCancellation: (token: CancellationToken) => void,
        sendTelemetry: (action: string, status: string, reason?: string) => void
    ): Promise<Array<{ name: string; value: string; importance: number }>> {
        const items: Array<{ name: string; value: string; importance: number }> = [];
        
        // Check if workspace folders exist
        if (!workspaceFolders || workspaceFolders.length === 0) {
            sendTelemetry("resolveProjectDependencies", "ContextEmpty", "NoWorkspace");
            return items;
        }
        
        const projectUri = workspaceFolders[0];
        
        // Resolve project dependencies
        const projectDependenciesResult = await resolveProjectDependenciesWithReason(projectUri.uri, copilotCancel);
        
        // Check for cancellation after dependency resolution
        checkCancellation(copilotCancel);
        
        // Send telemetry if result is empty
        if (projectDependenciesResult.isEmpty && projectDependenciesResult.emptyReason) {
            sendTelemetry("resolveProjectDependencies", "ContextEmpty", projectDependenciesResult.emptyReason);
        } else if (projectDependenciesResult.dependencyInfoList.length === 0) {
            // No error but still empty - likely no dependencies in project
            sendTelemetry("resolveProjectDependencies", "ContextEmpty", "NoDependenciesResults");
        }
        
        // Check for cancellation after telemetry
        checkCancellation(copilotCancel);
        
        // Convert project dependencies to context items
        if (projectDependenciesResult.dependencyInfoList && projectDependenciesResult.dependencyInfoList.length > 0) {
            for (const dep of projectDependenciesResult.dependencyInfoList) {
                items.push({
                    name: dep.key,
                    value: dep.value,
                    importance: 70
                });
            }
        }
        
        return items;
    }

    /**
     * Resolves local imports and converts them to context items with cancellation support
     * @param activeEditor The active text editor, or undefined if none
     * @param copilotCancel Cancellation token from Copilot
     * @param checkCancellation Function to check for cancellation
     * @param sendTelemetry Function to send telemetry data
     * @param createContextItems Function to create context items from imports
     * @returns Array of context items for local imports, or empty array if no valid editor
     */
    export async function resolveAndConvertLocalImports(
        activeEditor: { document: { uri: Uri; languageId: string } } | undefined,
        copilotCancel: CancellationToken,
        checkCancellation: (token: CancellationToken) => void,
        sendTelemetry: (action: string, status: string, reason?: string) => void,
        createContextItems: (classInfoList: any[]) => any[]
    ): Promise<any[]> {
        const items: any[] = [];
        
        // Check if there's an active editor with a Java document
        if (!activeEditor) {
            sendTelemetry("resolveLocalImports", "ContextEmpty", "NoActiveEditor");
            return items;
        }
        
        if (activeEditor.document.languageId !== 'java') {
            sendTelemetry("resolveLocalImports", "ContextEmpty", "NotJavaFile");
            return items;
        }
        
        const documentUri = activeEditor.document.uri;
        
        // Check for cancellation before resolving imports
        checkCancellation(copilotCancel);

        // Resolve imports directly without caching
        const importClassResult = await resolveLocalImportsWithReason(documentUri, copilotCancel);
        
        // Check for cancellation after resolution
        checkCancellation(copilotCancel);
        
        // Send telemetry if result is empty
        if (importClassResult.isEmpty && importClassResult.emptyReason) {
            sendTelemetry("resolveLocalImports", "ContextEmpty", importClassResult.emptyReason);
        } else if (importClassResult.classInfoList.length === 0) {
            // No error but still empty - likely no imports in file
            sendTelemetry("resolveLocalImports", "ContextEmpty", "NoImportsResults");
        }
        
        // Check for cancellation before processing results
        checkCancellation(copilotCancel);

        if (importClassResult.classInfoList && importClassResult.classInfoList.length > 0) {
            // Process imports in batches to reduce cancellation check overhead
            const contextItems = createContextItems(importClassResult.classInfoList);
            
            // Check cancellation once after creating all items
            checkCancellation(copilotCancel);
            
            items.push(...contextItems);
        }
        
        return items;
    }
}
