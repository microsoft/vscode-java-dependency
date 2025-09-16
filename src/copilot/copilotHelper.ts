// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, Uri, TextDocument } from "vscode";
import { Jdtls, INodeImportClass } from "../java/jdtls";
/**
 * Helper class for Copilot integration to analyze Java project dependencies
 */
export class CopilotHelper {  
    /**
     * Resolves all local project types imported by the given file
     * @param fileUri The URI of the Java file to analyze
     * @returns Array of strings in format "type:fully.qualified.name" where type is class|interface|enum|annotation
     */
    public static async resolveLocalImports(fileUri: Uri): Promise<INodeImportClass[]> {
        try {
            const result = await Jdtls.getImportClassContent(fileUri.toString());
            return result;
        } catch (error) {
            console.error("Error resolving copilot request:", error);
            return [];
        }
    }

    public async collectProjectContext(document: TextDocument): Promise<{ javaVersion: string }> {
        try {
            return await commands.executeCommand("java.project.getSettings", document.uri, ["java.home", "java.compliance", "java.source", "java.target"]);
        } catch (error) {
            console.error('Failed to get Java version:', error);
            return { javaVersion: 'unknown' };
        }
    }

    public async getPackageName(document: TextDocument): Promise<string> {
        try {
            const text = document.getText();
            const packageMatch = text.match(/^\s*package\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s*;/m);
            return packageMatch ? packageMatch[1] : 'default package';
        } catch (error) {
            console.log('Failed to get package name:', error);
            return 'unknown';
        }
    }
}
