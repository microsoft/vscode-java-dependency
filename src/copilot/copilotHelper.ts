// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, Uri, CancellationToken } from "vscode";

export interface INodeImportClass {
    uri: string;
    className: string;  // Changed from 'class' to 'className' to match Java code
}

interface INodeData {
    displayName?: string;
    name: string;
    moduleName?: string;
    path?: string;
    handlerIdentifier?: string;
    uri?: string;
    kind: number; // NodeKind enum value
    children?: any[];
    metaData?: { [id: string]: any };
}

enum NodeKind {
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
/**
 * Helper class for Copilot integration to analyze Java project dependencies
 */
export namespace CopilotHelper {
    /**
     * Resolves all local project types imported by the given file
     * @param fileUri The URI of the Java file to analyze
     * @param cancellationToken Optional cancellation token to abort the operation
     * @returns Array of strings in format "type:fully.qualified.name" where type is class|interface|enum|annotation
     */
    export async function resolveLocalImports(fileUri: Uri, cancellationToken?: CancellationToken): Promise<INodeImportClass[]> {
        if (cancellationToken?.isCancellationRequested) {
            return [];
        }
        
        if (cancellationToken?.isCancellationRequested) {
            return [];
        }
        
        try {
            // Create a promise that can be cancelled
            const commandPromise = commands.executeCommand("java.execute.workspaceCommand", "java.project.getImportClassContent", fileUri.toString()) as Promise<INodeImportClass[]>;
            
            if (cancellationToken) {
                const result = await Promise.race([
                    commandPromise,
                    new Promise<INodeImportClass[]>((_, reject) => {
                        cancellationToken.onCancellationRequested(() => {
                            reject(new Error('Operation cancelled'));
                        });
                    })
                ]);
                return result || [];
            } else {
                const result = await commandPromise;
                return result || [];
            }
        } catch (error: any) {
            if (error.message === 'Operation cancelled') {
                return [];
            }
            return [];
        }
    }

    /**
     * Get external libraries metadata for the project (top-level/direct dependencies only)
     * @param workspaceFolderUri The URI of the workspace folder
     * @param cancellationToken Optional cancellation token to abort the operation
     * @returns Array of DependencyMetadata objects containing name-value pairs
     */
    export async function getExternalLibrariesMetadata(workspaceFolderUri: Uri, cancellationToken?: CancellationToken): Promise<Array<{name: string, value: string}>> {
        if (cancellationToken?.isCancellationRequested) {
            return [];
        }

        try {
            const metadata: Array<{name: string, value: string}> = [];
            
            // Step 0: Get all projects in the workspace folder
            const projects = await commands.executeCommand(
                "java.execute.workspaceCommand",
                "java.project.list",
                workspaceFolderUri.toString()
            ) as INodeData[];
            
            
            if (!projects || projects.length === 0) {
                return [];
            }
            
            // Process the first project (or you can process all projects)
            const project = projects[0];
            const projectUri = project.uri;
            
            if (!projectUri) {
                return [];
            }
            
            
            if (cancellationToken?.isCancellationRequested) {
                return [];
            }
            
            // Step 1: Get project's children to find containers
            const projectChildren = await commands.executeCommand(
                "java.execute.workspaceCommand",
                "java.getPackageData",
                {
                    kind: NodeKind.Project,
                    projectUri: projectUri
                }
            ) as INodeData[];
            
            
            if (cancellationToken?.isCancellationRequested) {
                return [];
            }
            
            // Step 2: Find container nodes (Maven Dependencies, JRE System Library, Referenced Libraries)
            const containers = projectChildren?.filter(node => node.kind === NodeKind.Container) || [];
            
            // Also check for PackageRoot nodes directly in project children (these are top-level dependencies)
            const directPackageRoots = projectChildren?.filter(node => node.kind === NodeKind.PackageRoot) || [];
            
            // Process direct package roots first
            for (const pkgRoot of directPackageRoots) {
                if (cancellationToken?.isCancellationRequested) {
                    return metadata;
                }
                
                const jarName = pkgRoot.name || pkgRoot.displayName || 'unknown';
                const jarPath = pkgRoot.path || '';
                
                // Add dependency trait
                metadata.push({
                    name: `dependency:${jarName}`,
                    value: jarPath
                });
                
                // Add metadata if available
                if (pkgRoot.metaData) {
                    const groupId = pkgRoot.metaData['maven.groupId'];
                    const artifactId = pkgRoot.metaData['maven.artifactId'];
                    const version = pkgRoot.metaData['maven.version'];
                    
                    if (groupId && artifactId && version) {
                        metadata.push({
                            name: `dependency.coordinates:${jarName}`,
                            value: `${groupId}:${artifactId}:${version}`
                        });
                    }
                }
            }
            
            // Step 3: For containers, only get the top-level (direct) dependencies
            for (const container of containers) {
                if (cancellationToken?.isCancellationRequested) {
                    return metadata;
                }
                
                
                // Only process Maven Dependencies and Gradle Dependencies containers for direct dependencies
                const containerName = container.name?.toLowerCase() || '';
                const isRelevantContainer = containerName.includes('maven') || 
                                          containerName.includes('gradle') ||
                                          containerName.includes('referenced');
                
                if (!isRelevantContainer) {
                    continue;
                }
                
                const packageRoots = await commands.executeCommand(
                    "java.execute.workspaceCommand",
                    "java.getPackageData",
                    {
                        kind: NodeKind.Container,
                        projectUri: projectUri,
                        path: container.path
                    }
                ) as INodeData[];
                
                
                if (cancellationToken?.isCancellationRequested) {
                    return metadata;
                }
                
                // Process each top-level package root (these are direct dependencies)
                for (const pkgRoot of packageRoots || []) {
                    if (pkgRoot.kind === NodeKind.PackageRoot) {
                        const jarName = pkgRoot.name || pkgRoot.displayName || 'unknown';
                        const jarPath = pkgRoot.path || '';
                        
                        
                        // Add dependency trait
                        metadata.push({
                            name: `dependency:${jarName}`,
                            value: jarPath
                        });
                        
                        // Add metadata if available
                        if (pkgRoot.metaData) {
                            const groupId = pkgRoot.metaData['maven.groupId'];
                            const artifactId = pkgRoot.metaData['maven.artifactId'];
                            const version = pkgRoot.metaData['maven.version'];
                            
                            if (groupId && artifactId && version) {
                                metadata.push({
                                    name: `dependency.coordinates:${jarName}`,
                                    value: `${groupId}:${artifactId}:${version}`
                                });
                            }
                            
                            // Add type
                            if (containerName.includes('maven')) {
                                metadata.push({
                                    name: `dependency.type:${jarName}`,
                                    value: 'maven'
                                });
                            } else if (containerName.includes('gradle')) {
                                metadata.push({
                                    name: `dependency.type:${jarName}`,
                                    value: 'gradle'
                                });
                            }
                        }
                    }
                }
            }
            
            return metadata;
            
        } catch (error: any) {
            if (error.message === 'Operation cancelled') {
                return [];
            }
            console.error('[getExternalLibrariesMetadata] Error getting external libraries metadata:', error);
            return [];
        }
    }
}
