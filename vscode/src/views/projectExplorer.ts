"use strict";

import * as fse from "fs-extra";
import * as path from "path";
import * as vscode from "vscode";
import * as xml2js from "xml2js";
import { Commands } from "../commands";
export class ProjectExplorer {
    private static versionFileMapping: Map<string, string> = new Map([["jdk1.8", "Java8"], ["jdk-9", "Java9"], ["jdk-10", "Java10"]]);

    constructor(private readonly context: vscode.ExtensionContext) {
    }

    public async createJavaProject() {
        const javaHome: string = process.env.JAVA_HOME;
        if (!javaHome) {
            vscode.window.showErrorMessage("Please install JDK and set JAVA_HOME in environment variables first!");
            return;
        }
        let matchedValue: string;
        for (const key of ProjectExplorer.versionFileMapping.keys()) {
            if (javaHome.match(key) !== null && javaHome.match(key).length !== 0) {
                matchedValue = javaHome.match(key)[0];
            }
        }
        if (!matchedValue) {
            vscode.window.showErrorMessage("We currently only support JDK (version 1.8.0 or later).");
            return;
        }
        const targetResourceFolder = path.join(this.context.extensionPath, "resources", this._versionFileMapping.get(matchedValue));
        const location: vscode.Uri[] = await vscode.window.showOpenDialog({
            defaultUri: vscode.workspace.rootPath ? vscode.Uri.file(vscode.workspace.rootPath) : undefined,
            canSelectFiles: false,
            canSelectFolders: true,
            openLabel: "Select the location",
        });
        if (!location) {
            return;
        }
        const basePath: string = location[0].fsPath;
        const projectName: string = await vscode.window.showInputBox({
            prompt: "input java project name",
            validateInput: (name: string): string => {
                if (name && !name.match(/^[^*~/\\]+$/)) {
                    return "please input a valid project name";
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
        const projectFile: string = path.join(basePath, projectName, ".project");
        await Promise.all([
            fse.copy(path.join(this.context.extensionPath, "resources", "App.java.sample"),
                path.join(basePath, projectName, "src", "app", "App.java")),
            fse.copy(path.join(targetResourceFolder, "org.eclipse.jdt.core.prefs"),
                path.join(basePath, projectName, ".settings", "org.eclipse.jdt.core.prefs")),
            fse.copy(path.join(targetResourceFolder, ".classpath"),
                path.join(basePath, projectName, ".classpath")),
            fse.copy(path.join(this.context.extensionPath, "resources", ".project"), projectFile),
            fse.ensureDir(path.join(basePath, projectName, "bin")),
        ]);

        // replace the project name with user input project name
        const xml: string = await fse.readFile(projectFile, "utf8");
        const jsonObj: any = await this.parseXml(xml);
        jsonObj.projectDescription.name = projectName;
        const builder: xml2js.Builder = new xml2js.Builder();
        const newXml: string = builder.buildObject(jsonObj);
        await fse.writeFile(projectFile, newXml);

        vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(path.join(basePath, projectName)), true);
    }

    private async parseXml(xml: string): Promise<any> {
        return new Promise((resolve: (obj: {}) => void, reject: (e: Error) => void): void => {
            xml2js.parseString(xml, { explicitArray: true }, (err: Error, res: {}) => {
                if (err) {
                    return reject(err);
                }
                return resolve(res);
            });
        });
    }

}
