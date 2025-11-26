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
    workspace
} from 'vscode';

/**
 * Interface for resource reference parameters
 */
export interface IResourceReference {
    /**
     * Optional file path or URI to determine which project to analyze.
     * If not provided, will return all projects in workspace.
     */
    resourcePath?: string;
}

/**
 * Interface for dependency info (key-value pair)
 */
export interface IDependencyInfo {
    key: string;
    value: string;
}

/**
 * Interface for project dependencies result
 */
export interface IProjectDependenciesResult {
    dependencyInfoList: IDependencyInfo[];
    emptyReason?: string;
    isEmpty: boolean;
}

/**
 * Interface for project information extracted from dependencies
 */
export interface IProjectInfo {
    name?: string;
    location?: string;
    javaVersion?: string;
    sourceCompatibility?: string;
    targetCompatibility?: string;
    buildTool?: string;
    jreContainer?: string;
    moduleName?: string;
    totalLibraries?: string;
    totalProjectReferences?: string;
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
 * Language Model Tool for retrieving Java project information
 * This tool provides project name, path, and dependency tool versions
 */
export class ProjectInfoTool extends BaseTool<IResourceReference> {
    public static readonly toolName = 'java_project_get_info';

    constructor() {
        super(ProjectInfoTool.toolName);
    }

    async prepareInvocationImpl(
        _options: LanguageModelToolInvocationPrepareOptions<IResourceReference>,
        resource: Uri | undefined,
        _token: CancellationToken
    ): Promise<PreparedToolInvocation> {
        return {
            invocationMessage: resource 
                ? 'Getting Java project information for the specified file...'
                : 'Getting information for all Java projects in workspace...',
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
            // Get specific project info for a file
            const projectInfo = await this.getProjectInfoForResource(resource, token);
            if (!projectInfo) {
                return new LanguageModelToolResult([
                    new LanguageModelTextPart('No Java project found for the specified file.')
                ]);
            }
            
            return new LanguageModelToolResult([
                new LanguageModelTextPart(this.formatProjectInfo(projectInfo))
            ]);
        } else {
            // Get all projects
            const projects = await this.getAllProjects(token);
            if (projects.length === 0) {
                return new LanguageModelToolResult([
                    new LanguageModelTextPart('No Java projects found in the workspace.')
                ]);
            }
            
            const formattedProjects = projects.map(p => this.formatProjectInfo(p)).join('\n\n');
            return new LanguageModelToolResult([
                new LanguageModelTextPart(`Found ${projects.length} Java project(s):\n\n${formattedProjects}`)
            ]);
        }
    }

    /**
     * Get project information for a specific resource (file/folder)
     * Uses JAVA_PROJECT_GET_DEPENDENCIES command to retrieve project info
     */
    private async getProjectInfoForResource(resourceUri: Uri, token: CancellationToken): Promise<IProjectInfo | null> {
        if (token.isCancellationRequested) {
            throw new CancellationError();
        }

        try {
            const normalizedUri = decodeURIComponent(Uri.file(resourceUri.fsPath).toString());
            // const normalizedUri = resolveFilePath(resourceUri.toString());
            
            const result = await commands.executeCommand(
                Commands.EXECUTE_WORKSPACE_COMMAND,
                Commands.JAVA_PROJECT_GET_DEPENDENCIES,
                normalizedUri
            ) as IProjectDependenciesResult;

            if (token.isCancellationRequested) {
                throw new CancellationError();
            }

            if (!result || result.isEmpty || !result.dependencyInfoList) {
                return null;
            }

            return this.extractProjectInfo(result.dependencyInfoList);
        } catch (error) {
            if (error instanceof CancellationError) {
                throw error;
            }
            console.error('Error getting project info for resource:', error);
            throw new Error(`Failed to get project information: ${(error as Error).message}`);
        }
    }

    /**
     * Get information for all projects in workspace
     */
    private async getAllProjects(token: CancellationToken): Promise<IProjectInfo[]> {
        if (token.isCancellationRequested) {
            throw new CancellationError();
        }

        try {
            const projectUris: string[] = await commands.executeCommand(
                Commands.EXECUTE_WORKSPACE_COMMAND,
                Commands.GET_ALL_PROJECTS
            ) || [];

            if (token.isCancellationRequested) {
                throw new CancellationError();
            }

            const projects: IProjectInfo[] = [];
            for (const projectUri of projectUris) {
                if (token.isCancellationRequested) {
                    throw new CancellationError();
                }
                
                try {
                    const normalizedUri = decodeURIComponent(projectUri);
                    
                    const result = await commands.executeCommand(
                        Commands.EXECUTE_WORKSPACE_COMMAND,
                        Commands.JAVA_PROJECT_GET_DEPENDENCIES,
                        normalizedUri
                    ) as IProjectDependenciesResult;

                    if (result && !result.isEmpty && result.dependencyInfoList) {
                        const projectInfo = this.extractProjectInfo(result.dependencyInfoList);
                        if (projectInfo) {
                            projects.push(projectInfo);
                        }
                    }
                } catch (error) {
                    // Log but continue with other projects
                    console.error(`Error getting info for project ${projectUri}:`, error);
                }
            }
            
            return projects;
        } catch (error) {
            if (error instanceof CancellationError) {
                throw error;
            }
            console.error('Error getting all projects:', error);
            throw new Error(`Failed to get all projects: ${(error as Error).message}`);
        }
    }

    /**
     * Extract project information from dependency info list
     */
    private extractProjectInfo(dependencyInfoList: IDependencyInfo[]): IProjectInfo {
        const projectInfo: IProjectInfo = {};
        
        for (const info of dependencyInfoList) {
            switch (info.key) {
                case 'projectName':
                    projectInfo.name = info.value;
                    break;
                case 'projectLocation':
                    projectInfo.location = info.value;
                    break;
                case 'javaVersion':
                    projectInfo.javaVersion = info.value;
                    break;
                case 'sourceCompatibility':
                    projectInfo.sourceCompatibility = info.value;
                    break;
                case 'targetCompatibility':
                    projectInfo.targetCompatibility = info.value;
                    break;
                case 'buildTool':
                    projectInfo.buildTool = info.value;
                    break;
                case 'jreContainer':
                    projectInfo.jreContainer = info.value;
                    break;
                case 'moduleName':
                    projectInfo.moduleName = info.value;
                    break;
                case 'totalLibraries':
                    projectInfo.totalLibraries = info.value;
                    break;
                case 'totalProjectReferences':
                    projectInfo.totalProjectReferences = info.value;
                    break;
            }
        }
        
        return projectInfo;
    }

    /**
     * Format project information as a readable string
     */
    private formatProjectInfo(project: IProjectInfo): string {
        const parts: string[] = [];
        
        if (project.name) {
            parts.push(`**Project: ${project.name}**`);
        }
        
        if (project.location) {
            // Extract path from URI if it's a file:// URI
            let displayPath = project.location;
            if (displayPath.startsWith('file://')) {
                try {
                    displayPath = Uri.parse(displayPath).fsPath;
                } catch {
                    // Keep original if parse fails
                }
            }
            parts.push(`- Location: \`${displayPath}\``);
        }
        
        if (project.buildTool) {
            parts.push(`- Build Tool: ${project.buildTool}`);
        }
        
        if (project.javaVersion) {
            parts.push(`- Java Version: ${project.javaVersion}`);
        }
        
        if (project.sourceCompatibility) {
            parts.push(`- Source Compatibility: ${project.sourceCompatibility}`);
        }
        
        if (project.targetCompatibility) {
            parts.push(`- Target Compatibility: ${project.targetCompatibility}`);
        }
        
        if (project.jreContainer) {
            parts.push(`- JRE Container: ${project.jreContainer}`);
        }
        
        if (project.moduleName) {
            parts.push(`- Module Name: ${project.moduleName}`);
        }
        
        if (project.totalLibraries) {
            parts.push(`- Total Libraries: ${project.totalLibraries}`);
        }
        
        if (project.totalProjectReferences) {
            parts.push(`- Project References: ${project.totalProjectReferences}`);
        }
        
        return parts.join('\n');
    }

}
