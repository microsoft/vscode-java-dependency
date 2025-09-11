// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Uri } from "vscode";
import { Jdtls } from "./java/jdtls";

/**
 * Helper class for Copilot integration to analyze Java project dependencies
 */
export class CopilotHelper {
    
    /**
     * Resolves all local project types imported by the given file
     * @param fileUri The URI of the Java file to analyze
     * @returns Array of strings in format "type:fully.qualified.name" where type is class|interface|enum|annotation
     */
    public static async resolveLocalImports(fileUri: Uri): Promise<string[]> {
        try {
            const result = await Jdtls.resolveCopilotRequest(fileUri.toString());
            return result;
        } catch (error) {
            console.error("Error resolving copilot request:", error);
            return [];
        }
    }

    /**
     * Gets local project types imported by the given file, categorized by type
     * @param fileUri The URI of the Java file to analyze
     * @returns Object with categorized types
     */
    public static async getLocalImportsByType(fileUri: Uri): Promise<{
        classes: string[];
        interfaces: string[];
        enums: string[];
        annotations: string[];
        others: string[];
    }> {
        const result = {
            classes: [] as string[],
            interfaces: [] as string[],
            enums: [] as string[],
            annotations: [] as string[],
            others: [] as string[]
        };

        try {
            const imports = await this.resolveLocalImports(fileUri);
            
            for (const importInfo of imports) {
                const [type, typeName] = importInfo.split(":", 2);
                if (!typeName) {
                    result.others.push(importInfo);
                    continue;
                }

                switch (type) {
                    case "class":
                        result.classes.push(typeName);
                        break;
                    case "interface":
                        result.interfaces.push(typeName);
                        break;
                    case "enum":
                        result.enums.push(typeName);
                        break;
                    case "annotation":
                        result.annotations.push(typeName);
                        break;
                    default:
                        result.others.push(typeName);
                        break;
                }
            }
        } catch (error) {
            console.error("Error categorizing imports:", error);
        }

        return result;
    }

    /**
     * Gets a simple list of fully qualified type names imported from local project
     * @param fileUri The URI of the Java file to analyze
     * @returns Array of fully qualified type names
     */
    public static async getLocalImportTypeNames(fileUri: Uri): Promise<string[]> {
        try {
            const imports = await this.resolveLocalImports(fileUri);
            return imports.map(importInfo => {
                const [, typeName] = importInfo.split(":", 2);
                return typeName || importInfo;
            });
        } catch (error) {
            console.error("Error getting type names:", error);
            return [];
        }
    }
}
