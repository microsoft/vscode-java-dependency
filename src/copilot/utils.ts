// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.
import * as vscode from 'vscode';
import {
    ContextProviderApiV1,
    ResolveRequest,
    SupportedContextItem,
    type ContextProvider,
} from '@github/copilot-language-server';
import { sendInfo } from "vscode-extension-telemetry-wrapper";

/**
 * TelemetryQueue - Asynchronous telemetry queue to avoid blocking main thread
 * Based on the PromiseQueue pattern from copilot-client
 */
class TelemetryQueue {
    private promises = new Set<Promise<unknown>>();

    register(promise: Promise<unknown>): void {
        this.promises.add(promise);
        // Use void to avoid blocking - the key pattern from PromiseQueue
        void promise.finally(() => this.promises.delete(promise));
    }

    async flush(): Promise<void> {
        await Promise.allSettled(this.promises);
    }

    get size(): number {
        return this.promises.size;
    }
}

// Global telemetry queue instance
const globalTelemetryQueue = new TelemetryQueue();
/**
 * Error classes for Copilot context provider cancellation handling
 */
export class CancellationError extends Error {
    static readonly CANCELED = "Canceled";
    constructor() {
        super(CancellationError.CANCELED);
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

    static createContextItemsFromProjectDependencies(projectDepsResults: { key: string; value: string }[]): SupportedContextItem[] {
        return projectDepsResults.map(dep => ({
            name: dep.key,
            value: dep.value,
            importance: 70
        }));
    }

    /**
     * Create context items from import classes
     */
    static createContextItemsFromImports(importClasses: any[]): SupportedContextItem[] {
        return importClasses.map((cls: any) => ({
            uri: cls.uri,
            value: cls.value,
            importance: 80,
            origin: 'request' as const
        }));
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

    /**
     * Calculate approximate token count for context items
     * Using a simple heuristic: ~4 characters per token
     * Optimized for performance by using reduce and direct property access
     */
    static calculateTokenCount(items: SupportedContextItem[]): number {
        // Fast path: if no items, return 0
        if (items.length === 0) {
            return 0;
        }

        // Use reduce for better performance
        const totalChars = items.reduce((sum, item) => {
            let itemChars = 0;
            // Direct property access is faster than 'in' operator
            const value = (item as any).value;
            const name = (item as any).name;

            if (value && typeof value === 'string') {
                itemChars += value.length;
            }
            if (name && typeof name === 'string') {
                itemChars += name.length;
            }

            return sum + itemChars;
        }, 0);

        // Approximate: 1 token ≈ 4 characters
        // Use bitwise shift for faster division by 4
        return Math.ceil(totalChars / 4);
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

export class ContextProviderRegistrationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ContextProviderRegistrationError';
    }
}

export class GetImportClassContentError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GetImportClassContentError';
    }
}

export class GetProjectDependenciesError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GetProjectDependenciesError';
    }
}

export class ContextProviderResolverError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ContextProviderResolverError';
    }
}

/**
 * Asynchronously send telemetry data preparation and sending
 * This function prepares telemetry data and handles the actual sending asynchronously
 */
async function _sendContextResolutionTelemetry(
    request: ResolveRequest,
    duration: number,
    items: SupportedContextItem[],
    status: string,
    error?: string,
    dependenciesEmptyReason?: string,
    importsEmptyReason?: string,
    dependenciesCount?: number,
    importsCount?: number
): Promise<void> {
    try {
        const tokenCount = JavaContextProviderUtils.calculateTokenCount(items);
        const telemetryData: any = {
            "action": "resolveJavaContext",
            "completionId": request.completionId,
            "duration": duration,
            "itemCount": items.length,
            "tokenCount": tokenCount,
            "status": status,
            "dependenciesCount": dependenciesCount ?? 0,
            "importsCount": importsCount ?? 0
        };

        // Add empty reasons if present
        if (dependenciesEmptyReason) {
            telemetryData.dependenciesEmptyReason = dependenciesEmptyReason;
        }
        if (importsEmptyReason) {
            telemetryData.importsEmptyReason = importsEmptyReason;
        }
        if (error) {
            telemetryData.error = error;
        }

        // Actual telemetry sending - this is synchronous but network is async
        sendInfo("", telemetryData);
    } catch (telemetryError) {
        // Silently ignore telemetry errors to not affect main functionality
    }
}

/**
 * Send consolidated telemetry data for Java context resolution asynchronously
 * This function immediately returns and sends telemetry in the background without blocking
 *
 * @param request The resolve request from Copilot
 * @param duration Duration of the resolution in milliseconds
 * @param items The resolved context items
 * @param status Status of the resolution ("succeeded", "cancelled_by_copilot", "cancelled_internally", "error_partial_results")
 * @param error Optional error message
 * @param dependenciesEmptyReason Optional reason why dependencies were empty
 * @param importsEmptyReason Optional reason why imports were empty
 * @param dependenciesCount Number of dependency items resolved
 * @param importsCount Number of import items resolved
 */
export function sendContextResolutionTelemetry(
    request: ResolveRequest,
    duration: number,
    items: SupportedContextItem[],
    status: string,
    error?: string,
    dependenciesEmptyReason?: string,
    importsEmptyReason?: string,
    dependenciesCount?: number,
    importsCount?: number
): void {
    // Register the telemetry promise for non-blocking execution
    // This follows the PromiseQueue pattern from copilot-client
    globalTelemetryQueue.register(
        _sendContextResolutionTelemetry(
            request,
            duration,
            items,
            status,
            error,
            dependenciesEmptyReason,
            importsEmptyReason,
            dependenciesCount,
            importsCount
        )
    );
}

/**
 * Get the global telemetry queue instance (useful for testing and monitoring)
 */
export function getTelemetryQueue(): TelemetryQueue {
    return globalTelemetryQueue;
}