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
import { CopilotHelper } from '../copilotHelper';

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

export async function registerCopilotContextProviders(
    context: vscode.ExtensionContext
) {
    try {
        const copilotClientApi = await getCopilotClientApi();
        const copilotChatApi = await getCopilotChatApi();
        if (!copilotClientApi && !copilotChatApi) {
            console.log('Failed to find compatible version of GitHub Copilot extension installed. Skip registration of Copilot context provider.');
            return;
        }

        const provider: ContextProvider<SupportedContextItem> = {
            id: 'vscjava.vscode-java-pack', // use extension id as provider id for now
            selector: [{ language: "*" }],
            resolver: {
                resolve: async (request, token) => {
                    console.log('======== java request:', request);
                    console.log('======== java token:', token);
                    const items = await resolveJavaContext(request, token);
                    console.log('======== java context end ===========')
                    return items;
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

        // Register the Java completion context provider
        const javaCompletionProvider = new JavaCopilotCompletionContextProvider();
        let completionProviderInstallCount = 0;
        
        if (copilotClientApi) {
            const disposable = await installContextProvider(copilotClientApi, javaCompletionProvider);
            if (disposable) {
                context.subscriptions.push(disposable);
                completionProviderInstallCount++;
            }
        }
        if (copilotChatApi) {
            const disposable = await installContextProvider(copilotChatApi, javaCompletionProvider);
            if (disposable) {
                context.subscriptions.push(disposable);
                completionProviderInstallCount++;
            }
        }

        if (completionProviderInstallCount > 0) {
            console.log('Registration of Java completion context provider for GitHub Copilot extension succeeded.');
        } else {
            console.log('Failed to register Java completion context provider for GitHub Copilot extension.');
        }
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

        // const position = activeEditor.selection.active;
        // const currentRange = activeEditor.selection.isEmpty
        //     ? new vscode.Range(position, position)
        //     : activeEditor.selection;

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

        const importClass = await CopilotHelper.resolveLocalImports(document.uri);
        for(const cls of importClass) {
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
    console.log('Total context resolution time:', performance.now() - start);
    console.log('===== Size of context items:', items.length);
    return items;
}

async function collectProjectContext(document: vscode.TextDocument): Promise<{ javaVersion: string }> {
    try {
        return await vscode.commands.executeCommand("java.project.getSettings", document.uri, ["java.home"]);
    } catch (error) {
        console.log('Failed to get Java version:', error);
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

/**
 * Java-specific Copilot completion context provider
 * Similar to CopilotCompletionContextProvider but tailored for Java language
 */
export class JavaCopilotCompletionContextProvider implements ContextProvider<SupportedContextItem> {
    public readonly id = 'java-completion';
    public readonly selector = [{ language: 'java' }];
    public readonly resolver = this.resolve.bind(this);
    
    // Cache for completion contexts with timeout
    private cache = new Map<string, { context: SupportedContextItem[]; timestamp: number }>();
    private readonly cacheTimeout = 30000; // 30 seconds
    
    public async resolve(request: ResolveRequest, cancellationToken: vscode.CancellationToken): Promise<SupportedContextItem[]> {
        // Access document through request properties
        const docUri = request.documentContext?.uri?.toString();
        const docOffset = request.documentContext?.offset;
        
        // Only process Java files
        if (!docUri || !docUri.endsWith('.java')) {
            return [];
        }
        
        const cacheKey = `${docUri}:${docOffset}`;
        const cached = this.cache.get(cacheKey);
        
        // Return cached result if still valid
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.context;
        }
        
        try {
            const context = await this.generateJavaCompletionContext(docUri, docOffset, cancellationToken);
            
            // Cache the result
            this.cache.set(cacheKey, {
                context,
                timestamp: Date.now()
            });
            
            // Clean up old cache entries
            this.cleanCache();
            
            return context;
        } catch (error) {
            console.error('Error generating Java completion context:', error);
            return [];
        }
    }
    
    private async generateJavaCompletionContext(
        docUri: string,
        docOffset: number | undefined,
        cancellationToken: vscode.CancellationToken
    ): Promise<SupportedContextItem[]> {
        const context: SupportedContextItem[] = [];
        
        try {
            // Check for cancellation
            if (cancellationToken.isCancellationRequested) {
                return [];
            }
            
            // Get the document
            const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(docUri));
            if (!document) {
                return [];
            }
            
            // Get import class information from the Java project
            const importClassInfo = await CopilotHelper.getImportClassContent(docUri);
            
            if (importClassInfo && importClassInfo.length > 0) {
                // Convert import class information to context items
                for (const classInfo of importClassInfo) {
                    context.push({
                        name: `java.class.${this.extractClassName(classInfo.className)}`,
                        value: this.formatClassContext(classInfo.className),
                        importance: 75,
                        id: `java-class-${classInfo.uri}`,
                        origin: 'request'
                    });
                }
            }
            
            // Get related project context
            const projectContext = await this.getProjectContext(document);
            context.push(...projectContext);
            
            // Get current file context (surrounding methods, classes)
            const fileContext = await this.getCurrentFileContext(document, docOffset);
            context.push(...fileContext);
            
        } catch (error) {
            console.error('Error in generateJavaCompletionContext:', error);
        }
        
        return context;
    }
    
    private async getProjectContext(document: vscode.TextDocument): Promise<SupportedContextItem[]> {
        const context: SupportedContextItem[] = [];
        
        try {
            // Get local imports for better context
            const localImports = await CopilotHelper.resolveLocalImports(document.uri);
            
            if (localImports) {
                for (const importInfo of localImports) {
                    context.push({
                        name: `java.import.${importInfo.className}`,
                        value: this.formatImportContext(importInfo.className),
                        importance: 60,
                        id: `java-import-${importInfo.uri}`,
                        origin: 'request'
                    });
                }
            }
            
            // Get package information
            const packageName = await getPackageName(document);
            context.push({
                name: 'java.package',
                value: packageName,
                importance: 85,
                id: 'java-package-context',
                origin: 'request'
            });
            
        } catch (error) {
            console.error('Error getting project context:', error);
        }
        
        return context;
    }
    
    private async getCurrentFileContext(
        document: vscode.TextDocument,
        docOffset: number | undefined
    ): Promise<SupportedContextItem[]> {
        const context: SupportedContextItem[] = [];
        
        try {
            const text = document.getText();
            const lines = text.split('\n');
            
            // Calculate current line from offset if provided
            let currentLine = 0;
            if (docOffset !== undefined) {
                const textUpToOffset = text.substring(0, docOffset);
                currentLine = textUpToOffset.split('\n').length - 1;
            }
            
            // Get surrounding context (methods, classes around cursor)
            const contextRange = this.getContextRange(lines, currentLine);
            const contextContent = lines.slice(contextRange.start, contextRange.end).join('\n');
            
            if (contextContent.trim()) {
                context.push({
                    name: 'java.current.file.context',
                    value: contextContent,
                    importance: 70,
                    id: 'java-current-file-context',
                    origin: 'request'
                });
            }
        } catch (error) {
            console.error('Error getting current file context:', error);
        }
        
        return context;
    }
    
    private getContextRange(lines: string[], currentLine: number): { start: number; end: number } {
        const contextLines = 20; // Lines of context to include
        const start = Math.max(0, currentLine - contextLines);
        const end = Math.min(lines.length, currentLine + contextLines);
        
        return { start, end };
    }
    
    private formatClassContext(className: string): string {
        // Format class name for better Copilot understanding
        return `// Related class: ${className}`;
    }
    
    private formatImportContext(importName: string): string {
        return `// Related import: ${importName}`;
    }
    
    private extractClassName(className: string): string {
        // Extract simple class name from fully qualified name
        const parts = className.split('.');
        return parts[parts.length - 1] || 'Unknown';
    }
    
    private cleanCache(): void {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > this.cacheTimeout) {
                this.cache.delete(key);
            }
        }
    }
}