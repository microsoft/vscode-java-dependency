// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import { commands, extensions, Uri } from "vscode";
import { Commands, DataNode, LanguageServerMode } from "../extension.bundle";

export namespace Uris {
    // Simple Project
    export const SIMPLE_PROJECT_NODE = truePath("simple");
    export const SIMPLE_MAIN_PACKAGE = truePath("simple", "src", "main", "java");
    export const SIMPLE_MAIN_CLASS = truePath("simple", "src", "main", "java", "HelloWorld.java");

    // Maven Project
    export const MAVEN_PROJECT_NODE = truePath("maven");
    export const MAVEN_MAIN_PACKAGE = truePath("maven", "src", "main", "java");
    export const MAVEN_TEST_PACKAGE = truePath("maven", "src", "test", "java");
    export const MAVEN_MAIN_SUBPACKAGE = truePath("maven", "src", "main", "java", "com", "mycompany", "app");
    export const MAVEN_TEST_SUBPACKAGE = truePath("maven", "src", "test", "java", "com", "mycompany", "app");
    export const MAVEN_MAIN_CLASS = truePath("maven", "src", "main", "java", "com", "mycompany", "app", "App.java");
    export const MAVEN_TEST_CLASS = truePath("maven", "src", "test", "java", "com", "mycompany", "app", "AppTest.java");

    // Gradle Project
    export const GRADLE_PROJECT_NODE = truePath("gradle");
    export const GRADLE_MAIN_PACKAGE = truePath("gradle", "src", "main", "java");
    export const GRADLE_MAIN_CLASS = truePath("gradle", "src", "main", "java", "GradleTest.java");
}

export function fsPath(node: DataNode): string {
    if (!node.uri) {
        return "";
    }
    return Uri.parse(node.uri).fsPath;
}

export function truePath(...paths: string[]) {
    const basePath = path.join(__dirname, "..", "..", "test");
    return path.join(basePath, ...paths);
}

export async function setupTestEnv() {
    await new Promise(async (resolve) => {
        const extensionApi: any = extensions.getExtension("redhat.java")!.exports;
        extensionApi.onDidServerModeChange(async (mode: string) => {
            if (mode === LanguageServerMode.Standard) {
                resolve();
            }
        });

        await extensions.getExtension("vscjava.vscode-java-dependency")!.activate();
        // context would be initialized after this command
        await commands.executeCommand(Commands.JAVA_PROJECT_ACTIVATE);
    });
}
