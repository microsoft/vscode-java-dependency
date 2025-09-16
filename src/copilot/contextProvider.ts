/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import {
    ContextProviderApiV1,
    ResolveRequest,
    SupportedContextItem,
    type ContextProvider,
} from '@github/copilot-language-server';
import * as vscode from 'vscode';
import { CopilotHelper, INodeImportClass } from '../copilotHelper';
import { TreatmentVariables } from '../ext/treatmentVariables';
import { getExpService } from '../ext/ExperimentationService';
import { sendInfo } from "vscode-extension-telemetry-wrapper";
import * as crypto from 'crypto';

export enum NodeKind {
    Workspace = 1,
    Project = 2,
    PackageRoot = 3,
    Package = 4,
    PrimaryType = 5,
    CompilationUnit = 6,
    ClassFile = 7,
    Container = 8,
    Folder = 9,
    File = 10,
}

// Global cache for storing resolveLocalImports results
interface CacheEntry {
    value: INodeImportClass[];
    timestamp: number;
}

const globalImportsCache = new Map<string, CacheEntry>();
const CACHE_EXPIRY_TIME = 5 * 60 * 1000; // 5 minutes

/**
 * Generate a hash for the document URI to use as cache key
 * @param uri Document URI
 * @returns Hashed URI string
 */
function generateCacheKey(uri: vscode.Uri): string {
    return crypto.createHash('md5').update(uri.toString()).digest('hex');
}

/**
 * Get cached imports for a document URI
 * @param uri Document URI
 * @returns Cached imports or null if not found/expired
 */
function getCachedImports(uri: vscode.Uri): INodeImportClass[] | null {
    const key = generateCacheKey(uri);
    const cached = globalImportsCache.get(key);
    
    if (!cached) {
        return null;
    }
    
    // Check if cache is expired
    if (Date.now() - cached.timestamp > CACHE_EXPIRY_TIME) {
        globalImportsCache.delete(key);
        return null;
    }
    
    return cached.value;
}

/**
 * Set cached imports for a document URI
 * @param uri Document URI
 * @param imports Import class array to cache
 */
function setCachedImports(uri: vscode.Uri, imports: INodeImportClass[]): void {
    const key = generateCacheKey(uri);
    globalImportsCache.set(key, {
        value: imports,
        timestamp: Date.now()
    });
}

/**
 * Clear expired cache entries
 */
function clearExpiredCache(): void {
    const now = Date.now();
    for (const [key, entry] of globalImportsCache.entries()) {
        if (now - entry.timestamp > CACHE_EXPIRY_TIME) {
            globalImportsCache.delete(key);
        }
    }
}

export async function registerCopilotContextProviders(
    context: vscode.ExtensionContext
) {
    const contextProviderIsEnabled = await getExpService().getTreatmentVariableAsync(TreatmentVariables.VSCodeConfig, TreatmentVariables.ContextProvider, true);
    if (!contextProviderIsEnabled) {
        sendInfo("", {
            "contextProviderEnabled": "false",
        });
        return;
    }
    sendInfo("", {
        "contextProviderEnabled": "true",
    });
    
    // Start periodic cache cleanup
    const cacheCleanupInterval = setInterval(() => {
        clearExpiredCache();
    }, CACHE_EXPIRY_TIME); // Clean up every 5 minutes
    
    // Monitor file changes to invalidate cache
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.java');
    
    const invalidateCache = (uri: vscode.Uri) => {
        const key = generateCacheKey(uri);
        if (globalImportsCache.has(key)) {
            globalImportsCache.delete(key);
            console.log('======== Cache invalidated for:', uri.toString());
        }
    };
    
    fileWatcher.onDidChange(invalidateCache);
    fileWatcher.onDidDelete(invalidateCache);
    
    // Dispose the interval and file watcher when extension is deactivated
    context.subscriptions.push(
        new vscode.Disposable(() => {
            clearInterval(cacheCleanupInterval);
            globalImportsCache.clear(); // Clear all cache on disposal
        }),
        fileWatcher
    );
    
    try {
        const copilotClientApi = await getCopilotClientApi();
        const copilotChatApi = await getCopilotChatApi();
        if (!copilotClientApi || !copilotChatApi) {
            console.error('Failed to find compatible version of GitHub Copilot extension installed. Skip registration of Copilot context provider.');
            return;
        }
        // Register the Java completion context provider
        const provider: ContextProvider<SupportedContextItem> = {
            id: 'vscjava.vscode-java-pack', // use extension id as provider id for now
            selector: [{ language: "java" }],
            resolver: {
                resolve: async (request, token) => {                    
                    // Check if we have a cached result for the current active editor
                    const activeEditor = vscode.window.activeTextEditor;
                    if (activeEditor && activeEditor.document.languageId === 'java') {
                        const cachedImports = getCachedImports(activeEditor.document.uri);
                        if (cachedImports) {
                            console.log('======== Using cached imports, cache size:', cachedImports.length);
                            // Return cached result as context items
                            return cachedImports.map(cls => ({
                                uri: cls.uri,
                                value: cls.className,
                                importance: 70,
                                origin: 'request' as const
                            }));
                        }
                    }
                    
                    return await resolveJavaContext(request, token);
                }
            }
        };

        let installCount = 0;
        if (copilotClientApi) {
            const disposable = await installContextProvider(copilotClientApi, provider);
            if (disposable) {
                context.subscriptions.push(disposable);
                installCount++;
            }
        }
        if (copilotChatApi) {
            const disposable = await installContextProvider(copilotChatApi, provider);
            if (disposable) {
                context.subscriptions.push(disposable);
                installCount++;
            }
        }

        if (installCount === 0) {
            console.log('Incompatible GitHub Copilot extension installed. Skip registration of Java context providers.');
            return;
        }
        console.log('Registration of Java context provider for GitHub Copilot extension succeeded.');
    }
    catch (error) {
        console.log('Error occurred while registering Java context provider for GitHub Copilot extension:', error);
    }
}

async function resolveJavaContext(_request: ResolveRequest, _token: vscode.CancellationToken): Promise<SupportedContextItem[]> {
    const items: SupportedContextItem[] = [];
    const start = performance.now();
    try {
        // Get current document and position information
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || activeEditor.document.languageId !== 'java') {
            return items;
        }

        const document = activeEditor.document;

        // 1. Project basic information (High importance)
        const projectContext = await collectProjectContext(document);
        const packageName = await getPackageName(document);

        items.push({
            name: 'java.version',
            value: projectContext.javaVersion,
            importance: 90,
            id: 'java-version',
            origin: 'request'
        });

        items.push({
            name: 'java.file',
            value: vscode.workspace.asRelativePath(document.uri),
            importance: 80,
            id: 'java-file-path',
            origin: 'request'
        });

        items.push({
            name: 'java.package',
            value: packageName,
            importance: 85,
            id: 'java-package-name',
            origin: 'request'
        });

        // Try to get cached imports first
        let importClass = getCachedImports(document.uri);
        if (!importClass) {
            // If not cached, resolve and cache the result
            importClass = await CopilotHelper.resolveLocalImports(document.uri);
            setCachedImports(document.uri, importClass);
            console.log('======== Cached new imports, cache size:', importClass.length);
        } else {
            console.log('======== Using cached imports in resolveJavaContext, cache size:', importClass.length);
        }
        
        for (const cls of importClass) {
            items.push({
                uri: cls.uri,
                value: cls.className,
                importance: 70,
                origin: 'request'
            });
        }

        console.log('tick time', performance.now() - start);

    } catch (error) {
        console.log('Error resolving Java context:', error);
        // Add error information as context to help with debugging
        items.push({
            name: 'java.context.error',
            value: `${error}`,
            importance: 10,
            id: 'java-context-error',
            origin: 'request'
        });
    }
    console.log('Total context resolution time:', performance.now() - start, 'ms', ' ,size:', items.length);
    console.log('Context items:', items);
    return items;
}

async function collectProjectContext(document: vscode.TextDocument): Promise<{ javaVersion: string }> {
    try {
        return await vscode.commands.executeCommand("java.project.getSettings", document.uri, ["java.compliance", "java.source", "java.target"]);
    } catch (error) {
        console.error('Failed to get Java version:', error);
        return { javaVersion: 'unknown' };
    }
}

async function getPackageName(document: vscode.TextDocument): Promise<string> {
    try {
        const text = document.getText();
        const packageMatch = text.match(/^\s*package\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s*;/m);
        return packageMatch ? packageMatch[1] : 'default package';
    } catch (error) {
        console.log('Failed to get package name:', error);
        return 'unknown';
    }
}

interface CopilotApi {
    getContextProviderAPI(version: string): Promise<ContextProviderApiV1 | undefined>;
}

async function getCopilotClientApi(): Promise<CopilotApi | undefined> {
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

async function getCopilotChatApi(): Promise<CopilotApi | undefined> {
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

async function installContextProvider(
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
