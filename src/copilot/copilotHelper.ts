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
    errorReason?: string;
    hasError: boolean;
}

export interface IProjectDependency {
    [key: string]: string;
}

export interface IProjectDependenciesResult {
    dependencyInfoList: Array<{ key: string; value: string }>;
    errorReason?: string;
    hasError: boolean;
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
                errorReason: "Copilot_Cancellation_requested",
                hasError: false
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
                        errorReason: "Command returned null result",
                        hasError: true
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
                        errorReason: "Command returned null result",
                        hasError: true
                    };
                }
                
                return result;
            }
        } catch (error: any) {
            if (error.message === 'Operation cancelled') {
                return {
                    classInfoList: [],
                    errorReason: "Copilot_Cancellation_requested",
                    hasError: true
                };
            }
            
            if (error.message === 'Operation timed out') {
                return {
                    classInfoList: [],
                    errorReason: "Operation timed out after 80ms",
                    hasError: true
                };
            }
            
            const errorMessage = 'Failed_Get_Import_Info: ' + ((error as Error).message || "unknown_error");
            sendError(new GetImportClassContentError(errorMessage));
            return {
                classInfoList: [],
                errorReason: errorMessage,
                hasError: true
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
                errorReason: "Copilot_Cancellation_requested",
                hasError: true
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
                        errorReason: "Command returned null result",
                        hasError: true
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
                        errorReason: "Command returned null result",
                        hasError: true
                    };
                }
                
                return result;
            }
        } catch (error: any) {
            if (error.message === 'Operation cancelled') {
                return {
                    dependencyInfoList: [],
                    errorReason: 'Copilot_Cancellation_requested',
                    hasError: true
                };
            }
            
            if (error.message === 'Operation timed out') {
                return {
                    dependencyInfoList: [],
                    errorReason: "Operation timed out after 40ms",
                    hasError: true
                };
            }
            
            const errorMessage = 'Failed to get project dependencies: ' + ((error as Error).message || "unknown_error");
            sendError(new GetProjectDependenciesError(errorMessage));
            return {
                dependencyInfoList: [],
                errorReason: errorMessage,
                hasError: true
            };
        }
    }
}
