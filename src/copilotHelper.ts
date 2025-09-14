// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Uri } from "vscode";
import { Jdtls } from "./java/jdtls";

export interface INodeImportClass {
    uri: string;
    className: string;  // Changed from 'class' to 'className' to match Java code
}

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

    /**
     * Get import class content for the given file URI
     * @param fileUri The URI of the Java file as string
     * @returns Array of import class information with URI and content
     */
    public static async getImportClassContent(fileUri: string): Promise<INodeImportClass[]> {
        try {
            const result = await Jdtls.getImportClassContent(fileUri);
            return result;
        } catch (error) {
            console.error("Error getting import class content:", error);
            return [];
        }
    }
}
