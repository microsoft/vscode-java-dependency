import * as vscode from 'vscode';
import {
    ContextProviderApiV1,
    ResolveRequest,
    SupportedContextItem,
    type ContextProvider,
} from '@github/copilot-language-server';

/**
 * Error classes for Copilot context provider cancellation handling
 */
export class CancellationError extends Error {
    static readonly Canceled = "Canceled";
    constructor() {
        super(CancellationError.Canceled);
        this.name = this.message;
    }
}

export class InternalCancellationError extends CancellationError {
}

export class CopilotCancellationError extends CancellationError {
}

/**
 * Type definitions for common patterns
 */
export type ContextResolverFunction = (request: ResolveRequest, token: vscode.CancellationToken) => Promise<SupportedContextItem[]>;

export interface CopilotApiWrapper {
    clientApi?: CopilotApi;
    chatApi?: CopilotApi;
}

export interface CopilotApi {
    getContextProviderAPI(version: string): Promise<ContextProviderApiV1 | undefined>;
}

/**
 * Utility class for handling common operations in Java Context Provider
 */
export class JavaContextProviderUtils {
    /**
     * Check if operation should be cancelled and throw appropriate error
     */
    static checkCancellation(token: vscode.CancellationToken): void {
        if (token.isCancellationRequested) {
            throw new CopilotCancellationError();
        }
    }

    /**
     * Create context items from import classes
     */
    static createContextItemsFromImports(importClasses: any[]): SupportedContextItem[] {
        return importClasses.map((cls: any) => ({
            uri: cls.uri,
            value: cls.className,
            importance: 70,
            origin: 'request' as const
        }));
    }

    /**
     * Create a basic Java version context item
     */
    static createJavaVersionItem(javaVersion: string): SupportedContextItem {
        return {
            name: 'java.version',
            value: javaVersion,
            importance: 90,
            id: 'java-version',
            origin: 'request'
        };
    }


    /**
     * Get and validate Copilot APIs
     */
    static async getCopilotApis(): Promise<CopilotApiWrapper> {
        const copilotClientApi = await getCopilotClientApi();
        const copilotChatApi = await getCopilotChatApi();
        return { clientApi: copilotClientApi, chatApi: copilotChatApi };
    }

    /**
     * Install context provider on available APIs
     */
    static async installContextProviderOnApis(
        apis: CopilotApiWrapper, 
        provider: ContextProvider<SupportedContextItem>, 
        context: vscode.ExtensionContext,
        installFn: (api: CopilotApi, provider: ContextProvider<SupportedContextItem>) => Promise<vscode.Disposable | undefined>
    ): Promise<number> {
        let installCount = 0;
        
        if (apis.clientApi) {
            const disposable = await installFn(apis.clientApi, provider);
            if (disposable) {
                context.subscriptions.push(disposable);
                installCount++;
            }
        }
        
        if (apis.chatApi) {
            const disposable = await installFn(apis.chatApi, provider);
            if (disposable) {
                context.subscriptions.push(disposable);
                installCount++;
            }
        }
        
        return installCount;
    }
}

/**
 * Get Copilot client API
 */
export async function getCopilotClientApi(): Promise<CopilotApi | undefined> {
    const extension = vscode.extensions.getExtension<CopilotApi>('github.copilot');
    if (!extension) {
        return undefined;
    }
    try {
        return await extension.activate();
    } catch {
        return undefined;
    }
}

/**
 * Get Copilot chat API
 */
export async function getCopilotChatApi(): Promise<CopilotApi | undefined> {
    type CopilotChatApi = { getAPI?(version: number): CopilotApi | undefined };
    const extension = vscode.extensions.getExtension<CopilotChatApi>('github.copilot-chat');
    if (!extension) {
        return undefined;
    }

    let exports: CopilotChatApi | undefined;
    try {
        exports = await extension.activate();
    } catch {
        return undefined;
    }
    if (!exports || typeof exports.getAPI !== 'function') {
        return undefined;
    }
    return exports.getAPI(1);
}