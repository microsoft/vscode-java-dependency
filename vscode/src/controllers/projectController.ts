import * as fse from "fs-extra";
import * as path from "path";
import { commands, ExtensionContext, Uri, window, workspace } from "vscode";
import * as xml2js from "xml2js";
import { Utility } from "../utility";

export class ProjectController {
    constructor(public readonly context: ExtensionContext) {
    }

    public async createJavaProject() {
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
        const location: Uri[] = await window.showOpenDialog({
            defaultUri: workspace.rootPath ? Uri.file(workspace.rootPath) : undefined,
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
        const projectFile: string = path.join(basePath, projectName, ".project");
        const extensionPath: string = this.context.extensionPath;
        await Promise.all([
            fse.copy(path.join(extensionPath, "templates", "App.java.sample"), path.join(basePath, projectName, "src", "app", "App.java")),
            fse.copy(path.join(extensionPath, "templates", `Java${javaVersion}`), path.join(basePath, projectName)),
            fse.copy(path.join(extensionPath, "templates", ".project"), projectFile),
            fse.ensureDir(path.join(basePath, projectName, "bin")),
        ]);

        // replace the project name with user input project name
        const xml: string = await fse.readFile(projectFile, "utf8");
        const jsonObj: any = await Utility.parseXml(xml);
        jsonObj.projectDescription.name = projectName;
        const builder: xml2js.Builder = new xml2js.Builder();
        const newXml: string = builder.buildObject(jsonObj);
        await fse.writeFile(projectFile, newXml);

        commands.executeCommand("vscode.openFolder", Uri.file(path.join(basePath, projectName)), true);
    }
}
