// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Commands } from "../commands";
import {
    CancellationError,
    CancellationToken,
    commands,
    LanguageModelTextPart,
    LanguageModelTool,
    LanguageModelToolInvocationOptions,
    LanguageModelToolInvocationPrepareOptions,
    LanguageModelToolResult,
    PreparedToolInvocation,
    Uri,
    window,
    workspace
} from 'vscode';

/**
 * Interface for resource reference parameters
 */
export interface IResourceReference {
    /**
     * Optional file path or URI to determine which project to rebuild.
     * If not provided, will rebuild all projects in workspace.
     */
    resourcePath?: string;
}

/**
 * Helper to resolve file path from string to URI
 */
function resolveFilePath(filepath?: string): Uri | undefined {
    if (!filepath) {
        return workspace.workspaceFolders ? workspace.workspaceFolders[0].uri : undefined;
    }
    // starts with a scheme
    try {
        return Uri.parse(filepath);
    } catch (e) {
        return Uri.file(filepath);
    }
}

/**
 * Abstract base class for language model tools with common functionality
 */
abstract class BaseTool<T extends IResourceReference> implements LanguageModelTool<T> {
    constructor(protected readonly toolName: string) {}

    async invoke(
        options: LanguageModelToolInvocationOptions<T>,
        token: CancellationToken,
    ): Promise<LanguageModelToolResult> {
        if (!workspace.isTrusted) {
            return new LanguageModelToolResult([
                new LanguageModelTextPart('Cannot use this tool in an untrusted workspace.'),
            ]);
        }
        
        const resource = resolveFilePath(options.input.resourcePath);
        try {
            return await this.invokeImpl(options, resource, token);
        } catch (error: any) {
            const errorMsg = `Failed to execute ${this.toolName}: ${error.message || 'Unknown error'}`;
            throw new Error(errorMsg);
        }
    }

    protected abstract invokeImpl(
        options: LanguageModelToolInvocationOptions<T>,
        resource: Uri | undefined,
        token: CancellationToken,
    ): Promise<LanguageModelToolResult>;

    async prepareInvocation(
        options: LanguageModelToolInvocationPrepareOptions<T>,
        token: CancellationToken,
    ): Promise<PreparedToolInvocation> {
        const resource = resolveFilePath(options.input.resourcePath);
        return this.prepareInvocationImpl(options, resource, token);
    }

    protected abstract prepareInvocationImpl(
        options: LanguageModelToolInvocationPrepareOptions<T>,
        resource: Uri | undefined,
        token: CancellationToken,
    ): Promise<PreparedToolInvocation>;
}

/**
 * Language Model Tool for rebuilding Java projects
 * This tool triggers a rebuild of specified Java project(s)
 */
export class RebuildProjectTool extends BaseTool<IResourceReference> {
    public static readonly toolName = 'java_project_rebuild';

    constructor() {
        super(RebuildProjectTool.toolName);
    }

    async prepareInvocationImpl(
        _options: LanguageModelToolInvocationPrepareOptions<IResourceReference>,
        resource: Uri | undefined,
        _token: CancellationToken
    ): Promise<PreparedToolInvocation> {
        return {
            invocationMessage: resource 
                ? 'Rebuilding Java project for the specified file...'
                : 'Rebuilding all Java projects in workspace...',
        };
    }

    async invokeImpl(
        _options: LanguageModelToolInvocationOptions<IResourceReference>,
        resource: Uri | undefined,
        token: CancellationToken
    ): Promise<LanguageModelToolResult> {
        if (token.isCancellationRequested) {
            throw new CancellationError();
        }

        if (resource) {
            // Rebuild specific project for a file
            const result = await this.rebuildProjectForResource(resource, token);
            return new LanguageModelToolResult([
                new LanguageModelTextPart(result)
            ]);
        } else {
            // Rebuild all projects
            const result = await this.rebuildAllProjects(token);
            return new LanguageModelToolResult([
                new LanguageModelTextPart(result)
            ]);
        }
    }

    /**
     * Rebuild a specific project based on the resource URI
     */
    private async rebuildProjectForResource(resourceUri: Uri, token: CancellationToken): Promise<string> {
        if (token.isCancellationRequested) {
            throw new CancellationError();
        }

        try {
            const normalizedUri = decodeURIComponent(Uri.file(resourceUri.fsPath).toString());
            
            // Execute the rebuild command for the specific project
            await commands.executeCommand(Commands.BUILD_PROJECT, Uri.parse(normalizedUri), true);

            if (token.isCancellationRequested) {
                throw new CancellationError();
            }

            return `Successfully triggered rebuild for project at: ${resourceUri.fsPath}`;
        } catch (error) {
            if (error instanceof CancellationError) {
                throw error;
            }
            console.error('Error rebuilding project for resource:', error);
            
            // Show error message to user
            window.showErrorMessage(`Failed to rebuild project: ${(error as Error).message}`);
            throw new Error(`Failed to rebuild project: ${(error as Error).message}`);
        }
    }

    /**
     * Rebuild all projects in the workspace
     */
    private async rebuildAllProjects(token: CancellationToken): Promise<string> {
        if (token.isCancellationRequested) {
            throw new CancellationError();
        }

        try {
            // Get all projects in workspace
            const projectUris: string[] = await commands.executeCommand(
                Commands.EXECUTE_WORKSPACE_COMMAND,
                Commands.GET_ALL_PROJECTS
            ) || [];

            if (token.isCancellationRequested) {
                throw new CancellationError();
            }

            if (projectUris.length === 0) {
                return 'No Java projects found in the workspace to rebuild.';
            }

            // Rebuild each project
            let successCount = 0;
            let failCount = 0;
            const errors: string[] = [];

            for (const projectUri of projectUris) {
                if (token.isCancellationRequested) {
                    throw new CancellationError();
                }
                
                try {
                    const normalizedUri = decodeURIComponent(projectUri);
                    await commands.executeCommand(Commands.BUILD_PROJECT, Uri.parse(normalizedUri), true);
                    successCount++;
                } catch (error) {
                    failCount++;
                    const errorMsg = `Failed to rebuild project ${projectUri}: ${(error as Error).message}`;
                    errors.push(errorMsg);
                    console.error(errorMsg);
                }
            }

            let resultMessage = `Rebuild completed. Successfully rebuilt ${successCount} project(s).`;
            if (failCount > 0) {
                resultMessage += ` Failed to rebuild ${failCount} project(s).\n\nErrors:\n${errors.join('\n')}`;
            }

            return resultMessage;
        } catch (error) {
            if (error instanceof CancellationError) {
                throw error;
            }
            console.error('Error rebuilding all projects:', error);
            
            // Show error message to user
            window.showErrorMessage(`Failed to rebuild projects: ${(error as Error).message}`);
            throw new Error(`Failed to rebuild projects: ${(error as Error).message}`);
        }
    }
}
