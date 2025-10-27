/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import {
    ResolveRequest,
    SupportedContextItem,
    type ContextProvider,
} from '@github/copilot-language-server';
import * as vscode from 'vscode';
import { CopilotHelper } from './copilotHelper';
import { sendError, sendInfo } from "vscode-extension-telemetry-wrapper";
import {
    JavaContextProviderUtils,
    CancellationError,
    InternalCancellationError,
    CopilotCancellationError,
    ContextResolverFunction,
    CopilotApi,
    ContextProviderRegistrationError,
    ContextProviderResolverError
} from './utils';

export async function registerCopilotContextProviders(
    context: vscode.ExtensionContext
) {
    try {
        const apis = await JavaContextProviderUtils.getCopilotApis();
        if (!apis.clientApi || !apis.chatApi) {
            return;
        }

        // Register the Java completion context provider
        const provider: ContextProvider<SupportedContextItem> = {
            id: 'vscjava.vscode-java-dependency', // use extension id as provider id for now
            selector: [{ language: "java" }],
            resolver: { resolve: createJavaContextResolver() }
        };

        const installCount = await JavaContextProviderUtils.installContextProviderOnApis(apis, provider, context, installContextProvider);

        if (installCount === 0) {
            return;
        }
        
        sendInfo("", {
            "action": "registerCopilotContextProvider",
            "extension": 'vscjava.vscode-java-dependency',
            "status": "succeeded",
            "installCount": installCount
        });
    }
    catch (error) {
        sendError(new ContextProviderRegistrationError('Failed to register Copilot context provider: ' + ((error as Error).message || "unknown_error")));
    }
}

/**
 * Create the Java context resolver function
 */
function createJavaContextResolver(): ContextResolverFunction {
    return async (request: ResolveRequest, copilotCancel: vscode.CancellationToken): Promise<SupportedContextItem[]> => {
        try {
            // Check for immediate cancellation
            JavaContextProviderUtils.checkCancellation(copilotCancel);
            
            return await resolveJavaContext(request, copilotCancel);
        } catch (error: any) {
            sendError(new ContextProviderResolverError('Java Context Resolution Failed: ' + ((error as Error).message || "unknown_error")));
            // This should never be reached due to handleError throwing, but TypeScript requires it
            return [];
        }
    };
}

/**
 * Send telemetry data for Java context resolution
 */
function sendContextTelemetry(request: ResolveRequest, start: number, items: SupportedContextItem[], status: string, error?: string) {
    const duration = Math.round(performance.now() - start);
    const tokenCount = JavaContextProviderUtils.calculateTokenCount(items);
    const telemetryData: any = {
        "action": "resolveJavaContext",
        "completionId": request.completionId,
        "duration": duration,
        "itemCount": items.length,
        "tokenCount": tokenCount,
        "status": status
    };
    
    if (error) {
        telemetryData.error = error;
    }
    
    sendInfo("", telemetryData);
}

async function resolveJavaContext(request: ResolveRequest, copilotCancel: vscode.CancellationToken): Promise<SupportedContextItem[]> {
    const items: SupportedContextItem[] = [];
    const start = performance.now();
    
    try {
        // Check for cancellation before starting
        JavaContextProviderUtils.checkCancellation(copilotCancel);
        
        // Get current document and position information
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || activeEditor.document.languageId !== 'java') {
            return items;
        }

        const document = activeEditor.document;
        
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return items;
        }

        const projectUri = workspaceFolders[0];

        // Resolve project dependencies first
        const projectDependencies = await CopilotHelper.resolveProjectDependencies(projectUri.uri, copilotCancel);

        // Check for cancellation after dependency resolution
        JavaContextProviderUtils.checkCancellation(copilotCancel);
        
        // Convert project dependencies to Trait items
        if (projectDependencies && Object.keys(projectDependencies).length > 0) {
            for (const [key, value] of Object.entries(projectDependencies)) {
                items.push({
                    name: key,
                    value: value,
                    importance: 50
                });
            }
        }
        
        // Check for cancellation before resolving imports
        JavaContextProviderUtils.checkCancellation(copilotCancel);

        // Resolve imports directly without caching
        const importClass = await CopilotHelper.resolveLocalImports(document.uri, copilotCancel);
        
        // Check for cancellation after resolution
        JavaContextProviderUtils.checkCancellation(copilotCancel);
        
        // Check for cancellation before processing results
        JavaContextProviderUtils.checkCancellation(copilotCancel);

        if (importClass) {
            // Process imports in batches to reduce cancellation check overhead
            const contextItems = JavaContextProviderUtils.createContextItemsFromImports(importClass);
            
            // Check cancellation once after creating all items
            JavaContextProviderUtils.checkCancellation(copilotCancel);
            
            items.push(...contextItems);
        }
    } catch (error: any) {
        if (error instanceof CopilotCancellationError) {
            sendContextTelemetry(request, start, items, "cancelled_by_copilot");
            throw error;
        }
        if (error instanceof vscode.CancellationError || error.message === CancellationError.Canceled) {
            sendContextTelemetry(request, start, items, "cancelled_internally");
            throw new InternalCancellationError();
        }
        
        // Send telemetry for general errors (but continue with partial results)
        sendContextTelemetry(request, start, items, "error_partial_results", error.message || "unknown_error");
        
        // Return partial results and log completion for error case
        return items;
    }

    // Send telemetry data once at the end for success case
    sendContextTelemetry(request, start, items, "succeeded");
    
    return items;
}

export async function installContextProvider(
    copilotAPI: CopilotApi,
    contextProvider: ContextProvider<SupportedContextItem>
): Promise<vscode.Disposable | undefined> {
    const hasGetContextProviderAPI = typeof copilotAPI.getContextProviderAPI === 'function';
    if (hasGetContextProviderAPI) {
        const contextAPI = await copilotAPI.getContextProviderAPI('v1');
        if (contextAPI) {
            return contextAPI.registerContextProvider(contextProvider);
        }
    }
    return undefined;
}
