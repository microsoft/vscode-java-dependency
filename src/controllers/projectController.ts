// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from "fs-extra";
import * as path from "path";
import { commands, ExtensionContext, Uri, window, workspace } from "vscode";
import * as xml2js from "xml2js";
import { Utility } from "../utility";

export class ProjectController {
    constructor(public readonly context: ExtensionContext) {
    }

    public async createJavaProject() {
        const javaVersion: number = await this.getJavaVersion();
        if (!javaVersion) {
            return;
        }
        const workspaceFolder = Utility.getDefaultWorkspaceFolder();
        const location: Uri[] = await window.showOpenDialog({
            defaultUri: workspaceFolder && workspaceFolder.uri,
            canSelectFiles: false,
            canSelectFolders: true,
            openLabel: "Select the location",
        });
        if (!location || !location.length) {
            return;
        }
        const basePath: string = location[0].fsPath;
        const projectName: string = await window.showInputBox({
            prompt: "Input a java project name",
            validateInput: (name: string): string => {
                if (name && !name.match(/^[^*~/\\]+$/)) {
                    return "Please input a valid project name";
                }
                if (name && fse.pathExistsSync(path.join(basePath, name))) {
                    return "A project with this name already exists.";
                }
                return null;
            },
        });
        if (!projectName) {
            return;
        }
        if (await this.scaffoldJavaProject(basePath, projectName, javaVersion)) {
            return commands.executeCommand("vscode.openFolder", Uri.file(path.join(basePath, projectName)), true);
        }
    }

    private async scaffoldJavaProject(basePath: string, projectName: string, javaVersion: number): Promise<boolean> {
        const projectRoot: string = path.join(basePath, projectName);
        const templateRoot: string = path.join(this.context.extensionPath, "templates");
        const projectFile: string = path.join(projectRoot, ".project");
        try {
            let jdkSpecificTemplateRoot: string = path.join(templateRoot, `Java${javaVersion}`);
            if (!await fse.pathExists(jdkSpecificTemplateRoot)) {
                // fall back to 8
                jdkSpecificTemplateRoot = path.join(templateRoot, `Java8`);
            }
            await fse.ensureDir(projectRoot);
            await Promise.all([
                fse.copy(path.join(templateRoot, "App.java.sample"), path.join(projectRoot, "src", "app", "App.java")),
                fse.copy(jdkSpecificTemplateRoot, projectRoot),
                fse.copy(path.join(templateRoot, ".project"), path.join(projectRoot, ".project")),
                fse.ensureDir(path.join(projectRoot, "bin")),
            ]);

            // replace the project name with user input project name
            const xml: string = await fse.readFile(projectFile, "utf8");
            const jsonObj: any = await Utility.parseXml(xml);
            jsonObj.projectDescription.name = projectName;
            const builder: xml2js.Builder = new xml2js.Builder();
            const newXml: string = builder.buildObject(jsonObj);
            await fse.writeFile(projectFile, newXml);
        } catch (error) {
            window.showErrorMessage(error.message);
            return;
        }
        return true;
    }

    private async getJavaVersion(): Promise<number> {
        let javaVersion: number;
        try {
            const javaHome: string = await Utility.checkJavaRuntime();
            javaVersion = await Utility.checkJavaVersion(javaHome);
        } catch (error) {
            window.showErrorMessage(error.message, error.label).then((selection) => {
                if (error.label && error.label === selection && error.openUrl) {
                    commands.executeCommand("vscode.open", error.openUrl);
                }
            });
            return;
        }
        return javaVersion;
    }
}
