// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, Uri, CancellationToken } from "vscode";
import { sendError } from "vscode-extension-telemetry-wrapper";
import { GetImportClassContentError, GetProjectDependenciesError, JavaContextProviderUtils } from "./utils";
import { Commands } from '../commands';

/**
 * Enum for error messages used in Promise rejection
 */
export enum ErrorMessage {
    OperationCancelled = "Operation cancelled",
    OperationTimedOut = "Operation timed out"
}

/**
 * Enum for empty reason codes when operations return empty results
 */
export enum EmptyReason {
    CopilotCancelled = "CopilotCancelled",
    CommandNullResult = "CommandNullResult",
    Timeout = "Timeout",
    NoWorkspace = "NoWorkspace",
    NoDependenciesResults = "NoDependenciesResults",
    NoActiveEditor = "NoActiveEditor",
    NotJavaFile = "NotJavaFile",
    NoImportsResults = "NoImportsResults"
}

export interface INodeImportClass {
    uri: string;
    value: string;
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
    dependencyInfoList: { key: string; value: string }[];
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
                emptyReason: EmptyReason.CopilotCancelled,
                isEmpty: true
            };
        }

        try {
            const normalizedUri = decodeURIComponent(Uri.file(fileUri.fsPath).toString());
            const commandPromise = commands.executeCommand(
                Commands.EXECUTE_WORKSPACE_COMMAND,
                Commands.JAVA_PROJECT_GET_IMPORT_CLASS_CONTENT,
                normalizedUri
            ) as Promise<IImportClassContentResult>;
            if (cancellationToken) {
                const result = await Promise.race([
                    commandPromise,
                    new Promise<IImportClassContentResult>((_, reject) => {
                        cancellationToken.onCancellationRequested(() => {
                            reject(new Error(ErrorMessage.OperationCancelled));
                        });
                    }),
                    new Promise<IImportClassContentResult>((_, reject) => {
                        setTimeout(() => {
                            reject(new Error(ErrorMessage.OperationTimedOut));
                        }, 80); // 80ms timeout
                    })
                ]);
                if (!result) {
                    return {
                        classInfoList: [],
                        emptyReason: EmptyReason.CommandNullResult,
                        isEmpty: true
                    };
                }
                return result;
            } else {
                const result = await Promise.race([
                    commandPromise,
                    new Promise<IImportClassContentResult>((_, reject) => {
                        setTimeout(() => {
                            reject(new Error(ErrorMessage.OperationTimedOut));
                        }, 80); // 80ms timeout
                    })
                ]);
                if (!result) {
                    return {
                        classInfoList: [],
                        emptyReason: EmptyReason.CommandNullResult,
                        isEmpty: true
                    };
                }
                return result;
            }
        } catch (error: any) {
            if (error.message === ErrorMessage.OperationCancelled) {
                return {
                    classInfoList: [],
                    emptyReason: EmptyReason.CopilotCancelled,
                    isEmpty: true
                };
            }
            if (error.message === ErrorMessage.OperationTimedOut) {
                return {
                    classInfoList: [],
                    emptyReason: EmptyReason.Timeout,
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
    export async function resolveProjectDependenciesWithReason(
        fileUri: Uri,
        cancellationToken?: CancellationToken
    ): Promise<IProjectDependenciesResult> {
        if (cancellationToken?.isCancellationRequested) {
            return {
                dependencyInfoList: [],
                emptyReason: EmptyReason.CopilotCancelled,
                isEmpty: true
            };
        }

        try {
            const normalizedUri = decodeURIComponent(Uri.file(fileUri.fsPath).toString());
            const commandPromise = commands.executeCommand(
                Commands.EXECUTE_WORKSPACE_COMMAND,
                Commands.JAVA_PROJECT_GET_DEPENDENCIES,
                normalizedUri
            ) as Promise<IProjectDependenciesResult>;

            if (cancellationToken) {
                const result = await Promise.race([
                    commandPromise,
                    new Promise<IProjectDependenciesResult>((_, reject) => {
                        cancellationToken.onCancellationRequested(() => {
                            reject(new Error(ErrorMessage.OperationCancelled));
                        });
                    }),
                    new Promise<IProjectDependenciesResult>((_, reject) => {
                        setTimeout(() => {
                            reject(new Error(ErrorMessage.OperationTimedOut));
                        }, 40); // 40ms timeout
                    })
                ]);
                if (!result) {
                    return {
                        dependencyInfoList: [],
                        emptyReason: EmptyReason.CommandNullResult,
                        isEmpty: true
                    };
                }
                return result;
            } else {
                const result = await Promise.race([
                    commandPromise,
                    new Promise<IProjectDependenciesResult>((_, reject) => {
                        setTimeout(() => {
                            reject(new Error(ErrorMessage.OperationTimedOut));
                        }, 40); // 40ms timeout
                    })
                ]);
                if (!result) {
                    return {
                        dependencyInfoList: [],
                        emptyReason: EmptyReason.CommandNullResult,
                        isEmpty: true
                    };
                }
                return result;
            }
        } catch (error: any) {
            if (error.message === ErrorMessage.OperationCancelled) {
                return {
                    dependencyInfoList: [],
                    emptyReason: EmptyReason.CopilotCancelled,
                    isEmpty: true
                };
            }
            if (error.message === ErrorMessage.OperationTimedOut) {
                return {
                    dependencyInfoList: [],
                    emptyReason: EmptyReason.Timeout,
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
     * Result interface for dependency resolution with diagnostic information
     */
    export interface IResolveResult {
        items: any[];
        emptyReason?: string;
        itemCount: number;
    }

    /**
     * Resolves project dependencies and converts them to context items with cancellation support
     * @param activeEditor The active text editor, or undefined if none
     * @param copilotCancel Cancellation token from Copilot
     * @param checkCancellation Function to check for cancellation
     * @returns Result object containing context items and diagnostic information
     */
    export async function resolveAndConvertProjectDependencies(
        activeEditor: { document: { uri: Uri; languageId: string } } | undefined,
        copilotCancel: CancellationToken,
        checkCancellation: (token: CancellationToken) => void
    ): Promise<IResolveResult> {
        const items: any[] = [];
        
        // Check if workspace folders exist
        if (!activeEditor) {
            return { items: [], emptyReason: EmptyReason.NoActiveEditor, itemCount: 0 };
        }
        if (activeEditor.document.languageId !== 'java') {
            return { items: [], emptyReason: EmptyReason.NotJavaFile, itemCount: 0 };
        }
        const documentUri = activeEditor.document.uri;

        // Resolve project dependencies
        const projectDependenciesResult = await resolveProjectDependenciesWithReason(documentUri, copilotCancel);

        // Check for cancellation after dependency resolution
        checkCancellation(copilotCancel);

        // Return empty result with reason if no dependencies found
        if (projectDependenciesResult.isEmpty && projectDependenciesResult.emptyReason) {
            return { items: [], emptyReason: projectDependenciesResult.emptyReason, itemCount: 0 };
        }

        // Check for cancellation after telemetry
        checkCancellation(copilotCancel);

        // Convert project dependencies to context items
        if (projectDependenciesResult.dependencyInfoList && projectDependenciesResult.dependencyInfoList.length > 0) {
            const contextItems = JavaContextProviderUtils.createContextItemsFromProjectDependencies(projectDependenciesResult.dependencyInfoList);

            // Check cancellation once after creating all items
            checkCancellation(copilotCancel);
            items.push(...contextItems);
        }

        return { items, itemCount: items.length };
    }

    /**
     * Resolves local imports and converts them to context items with cancellation support
     * @param activeEditor The active text editor, or undefined if none
     * @param copilotCancel Cancellation token from Copilot
     * @param checkCancellation Function to check for cancellation
     * @returns Result object containing context items and diagnostic information
     */
    export async function resolveAndConvertLocalImports(
        activeEditor: { document: { uri: Uri; languageId: string } } | undefined,
        copilotCancel: CancellationToken,
        checkCancellation: (token: CancellationToken) => void
    ): Promise<IResolveResult> {
        const items: any[] = [];
        
        // Check if there's an active editor with a Java document
        if (!activeEditor) {
            return { items: [], emptyReason: EmptyReason.NoActiveEditor, itemCount: 0 };
        }
        if (activeEditor.document.languageId !== 'java') {
            return { items: [], emptyReason: EmptyReason.NotJavaFile, itemCount: 0 };
        }

        const documentUri = activeEditor.document.uri;

        // Check for cancellation before resolving imports
        checkCancellation(copilotCancel);
        // Resolve imports directly without caching
        const importClassResult = await resolveLocalImportsWithReason(documentUri, copilotCancel);

        // Check for cancellation after resolution
        checkCancellation(copilotCancel);

        // Return empty result with reason if no imports found
        if (importClassResult.isEmpty && importClassResult.emptyReason) {
            return { items: [], emptyReason: importClassResult.emptyReason, itemCount: 0 };
        }
        
        // Check for cancellation before processing results
        checkCancellation(copilotCancel);
        if (importClassResult.classInfoList && importClassResult.classInfoList.length > 0) {
            // Process imports in batches to reduce cancellation check overhead
            const contextItems = JavaContextProviderUtils.createContextItemsFromImports(importClassResult.classInfoList);
            // Check cancellation once after creating all items
            checkCancellation(copilotCancel);
            items.push(...contextItems);
        }

        return { items, itemCount: items.length };
    }
}
