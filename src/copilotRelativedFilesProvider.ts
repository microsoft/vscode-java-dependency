/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DataNode } from "./views/dataNode";
import { explorerNodeCache } from "./views/nodeCache/explorerNodeCache";
import { ProjectNode } from "./views/projectNode";
import { ContainerNode } from "./views/containerNode";

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
                api.registerRelatedFilesProvider(id, async (uri, _, token) => {
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