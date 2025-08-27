/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DataNode } from "./views/dataNode";
import { explorerNodeCache } from "./views/nodeCache/explorerNodeCache";
import { ProjectNode } from "./views/projectNode";
import { ContainerNode } from "./views/containerNode";
import { DependencyExplorer, INodeData, Jdtls, NodeKind } from '../extension.bundle';

class DependencyHelper {
    constructor(private explorer: DependencyExplorer) {}
    
    async getDependencyUris(fileUri: vscode.Uri): Promise<{
        jarUris: string[];
        mavenUris: string[];
        gradleUris: string[];
        allUris: string[];
    }> {
        const result = {
            jarUris: [] as string[],
            mavenUris: [] as string[],
            gradleUris: [] as string[],
            allUris: [] as string[]
        };
        
        // 1. 使用 reveal 方法确保节点已加载
        await this.explorer.reveal(fileUri, false);
        
        // 2. 从缓存获取节点
        const node = explorerNodeCache.getDataNode(fileUri);
        if (!node) {
            return result;
        }
        
        // 3. 查找项目节点
        const projectNode = await this.findProjectNode(node);
        if (!projectNode) {
            return result;
        }
        
        // 4. 获取依赖信息
        const containers = await this.getContainerNodes(projectNode);
        
        for (const container of containers) {
            const dependencies = await container.getChildren();
            const containerType = container.getContainerType();
            
            for (const dep of dependencies) {
                if (dep instanceof DataNode && dep.uri) {
                    result.allUris.push(dep.uri);
                    
                    // 根据容器类型分类
                    switch (containerType) {
                        case "maven":
                            result.mavenUris.push(dep.uri);
                            break;
                        case "gradle":
                            result.gradleUris.push(dep.uri);
                            break;
                        default:
                            result.jarUris.push(dep.uri);
                            break;
                    }
                }
            }
        }
        
        return result;
    }
    
    private async findProjectNode(node: DataNode): Promise<ProjectNode | undefined> {
        let current = node;
        while (current && !(current instanceof ProjectNode)) {
            current = current.getParent() as DataNode;
        }
        return current as ProjectNode;
    }
    
    private async getContainerNodes(projectNode: ProjectNode): Promise<ContainerNode[]> {
        const children = await projectNode.getChildren();
        return children.filter(child => child instanceof ContainerNode) as ContainerNode[];
    }
}

// 使用示例
async function example(fileUri: vscode.Uri, explorer: DependencyExplorer) {
    const helper = new DependencyHelper(explorer);
    const dependencies = await helper.getDependencyUris(fileUri);
    
    console.log("Maven dependencies:", dependencies.mavenUris);
    console.log("Gradle dependencies:", dependencies.gradleUris);
    console.log("JAR dependencies:", dependencies.jarUris);
    console.log("All dependencies:", dependencies.allUris);
}

async function getDependenciesFromJdtls(fileUri: vscode.Uri): Promise<string[]> {
    const dependencyUris: string[] = [];
    
    try {
        // 1. 使用 Jdtls.resolvePath 获取文件到项目的路径
        const paths: INodeData[] = await Jdtls.resolvePath(fileUri.toString());
        
        if (paths.length === 0) {
            return dependencyUris;
        }
        
        // 2. 第一个路径通常是项目节点
        const projectNodeData = paths[0];
        if (!projectNodeData || !projectNodeData.uri) {
            return dependencyUris;
        }
        
        // 3. 获取项目的包数据，包括依赖
        const projectChildren: INodeData[] = await Jdtls.getPackageData({
            kind: NodeKind.Project,
            projectUri: projectNodeData.uri
        });
        
        // 4. 查找依赖容器节点
        for (const child of projectChildren) {
            if (child.kind === NodeKind.Container) {
                // 5. 获取容器内的依赖
                const containerChildren: INodeData[] = await Jdtls.getPackageData({
                    kind: NodeKind.Container,
                    projectUri: projectNodeData.uri,
                    path: child.path
                });
                
                // 6. 收集所有依赖的 URI
                for (const dep of containerChildren) {
                    if (dep.uri) {
                        dependencyUris.push(dep.uri);
                    }
                }
            }
        }
        
    } catch (error) {
        console.error("Error getting dependencies:", error);
    }
    
    return dependencyUris;
}

async function getDependenciesFromCache(fileUri: vscode.Uri): Promise<string[]> {
    const dependencyUris: string[] = [];
    
    // 1. 先尝试从缓存中获取文件节点
    let currentNode: DataNode | undefined = explorerNodeCache.getDataNode(fileUri);
    
    if (!currentNode) {
        // 2. 如果缓存中没有，尝试找到最接近的祖先节点
        currentNode = explorerNodeCache.findBestMatchNodeByUri(fileUri);
    }
    
    if (!currentNode) {
        return dependencyUris;
    }
    
    // 3. 向上查找到项目节点
    let projectNode: ProjectNode | undefined;
    let node = currentNode;
    while (node && !(node instanceof ProjectNode)) {
        node = node.getParent() as DataNode;
    }
    projectNode = node as ProjectNode;
    
    if (!projectNode) {
        return dependencyUris;
    }
    
    // 4. 获取项目的所有子节点，查找依赖容器
    const children = await projectNode.getChildren();
    for (const child of children) {
        if (child instanceof ContainerNode) {
            const containerChildren = await child.getChildren();
            for (const dep of containerChildren) {
                if (dep instanceof DataNode && dep.uri) {
                    dependencyUris.push(dep.uri);
                }
            }
        }
    }
    
    return dependencyUris;
}

interface CopilotTrait {
    name: string;
    value: string;
    includeInPrompt?: boolean;
    promptTextOverride?: string;
}

interface CopilotRelatedFilesProviderRegistration {
    registerRelatedFilesProvider(
        providerId: { extensionId: string; languageId: string },
        callback: (
            uri: vscode.Uri,
            context: { flags: Record<string, unknown> },
            cancellationToken?: vscode.CancellationToken
        ) => Promise<{ entries: vscode.Uri[]; traits?: CopilotTrait[] }>
    ): vscode.Disposable;
}

export function registerCopilotRelatedFilesProvider(
    context: vscode.ExtensionContext,
) {
    const copilotApi = vscode.extensions.getExtension<CopilotRelatedFilesProviderRegistration>('github.copilot');
    if (!copilotApi) {
        // channel.debug(
        //     'Failed to find comnpatible version of GitHub Copilot extension installed. Skip registeration of Copilot related files provider.'
        // );
        return;
    }

    copilotApi.activate().then(async (api) => {
        try {
            const id = {
                extensionId: 'vscjava.vscode-java-dependency',
                languageId: 'java',
            };

            context.subscriptions.push(
                api.registerRelatedFilesProvider(id, async (uri, _context, _cancellationToken) => {
                    const relatedFiles: vscode.Uri[] = [];
                    getDependenciesFromCache(uri).then(dependencyUris => {
                        relatedFiles.push(...dependencyUris.map(dep => vscode.Uri.file(dep)));
                    });
                    return { entries: relatedFiles };
                })
            );

            // channel.debug('Registration of C# related files provider for GitHub Copilot extension succeeded.');
        } catch (error) {
            // channel.error('Failed to register Copilot related files providers', error);
            throw error;
        }
    });
}