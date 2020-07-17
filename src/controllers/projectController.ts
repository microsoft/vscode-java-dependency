// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from "fs-extra";
import * as _ from "lodash";
import * as path from "path";
import { commands, Disposable, Extension, ExtensionContext, extensions, QuickPickItem, Uri, window, workspace } from "vscode";
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { Commands } from "../commands";
import { Utility } from "../utility";

export class ProjectController implements Disposable {

    private disposable: Disposable;

    public constructor(public readonly context: ExtensionContext) {
        this.disposable = Disposable.from(
            instrumentOperationAsVsCodeCommand(Commands.JAVA_PROJECT_CREATE, () => this.createJavaProject()),
        );
    }

    public dispose() {
        this.disposable.dispose();
    }

    public async createJavaProject() {
        const items: IProjectTypeQuickPick[] = projectTypes.map((type: IProjectType) => {
            return {
                label: type.displayName,
                detail: type.metadata.extensionName ? `Provided by $(extensions) ${type.metadata.extensionName}` : type.detail,
                metadata: type.metadata,
            };
        });
        const choice = await window.showQuickPick(items, {
            ignoreFocusOut: true,
            placeHolder: "Select the project type",
        });
        if (!choice || !await ensureExtension(choice.label, choice.metadata)) {
            return;
        }

        if (choice.metadata.type === ProjectType.NoBuildTool) {
            await scaffoldSimpleProject();
        } else if (choice.metadata.createCommandId) {
            await commands.executeCommand(choice.metadata.createCommandId);
        }
    }
}

interface IProjectType {
    displayName: string;
    detail?: string;
    metadata: IProjectTypeMetadata;
}

interface IProjectTypeMetadata {
    type: ProjectType;
    extensionId: string;
    extensionName: string;
    createCommandId: string;
}

interface IProjectTypeQuickPick extends QuickPickItem {
    metadata: IProjectTypeMetadata;
}

enum ProjectType {
    NoBuildTool = "NoBuildTool",
    Maven = "Maven",
    SpringBoot = "SpringBoot",
    Quarkus = "Quarkus",
    MicroProfile = "MicroProfile",
}

async function ensureExtension(typeName: string, metaData: IProjectTypeMetadata): Promise<boolean> {
    if (!metaData.extensionId) {
        return true;
    }

    const extension: Extension<any> | undefined = extensions.getExtension(metaData.extensionId);
    if (extension === undefined) {
        await promptInstallExtension(typeName, metaData);
        return false;
    }

    await extension.activate();
    return true;
}

async function promptInstallExtension(projectType: string, metaData: IProjectTypeMetadata): Promise<void> {
    const choice: string | undefined = await window.showInformationMessage(`${metaData.extensionName} is required to create ${projectType} projects. Please re-run the command 'Java: Create Java Project' after the extension is installed.`, "Install");
    if (choice === "Install") {
        commands.executeCommand("workbench.extensions.installExtension", metaData.extensionId);
        // So far there is no API to query the extension's state, so we open the extension's homepage
        // here, where users can check the state: installing, disabled, installed, etc...
        // See: https://github.com/microsoft/vscode/issues/14444
        commands.executeCommand("extension.open", metaData.extensionId);
    }
}

async function scaffoldSimpleProject(): Promise<void> {
    const workspaceFolder = Utility.getDefaultWorkspaceFolder();
    const location: Uri[] | undefined = await window.showOpenDialog({
        defaultUri: workspaceFolder && workspaceFolder.uri,
        canSelectFiles: false,
        canSelectFolders: true,
        openLabel: "Select the location",
    });
    if (!location || !location.length) {
        return;
    }

    const basePath: string = location[0].fsPath;
    const projectName: string | undefined = await window.showInputBox({
        prompt: "Input a java project name",
        ignoreFocusOut: true,
        validateInput: async (name: string): Promise<string> => {
            if (name && !name.match(/^[^*~/\\]+$/)) {
                return "Please input a valid project name";
            }
            if (name && await fse.pathExists(path.join(basePath, name))) {
                return "A project with this name already exists.";
            }
            return "";
        },
    });

    if (!projectName) {
        return;
    }

    const projectRoot: string = path.join(basePath, projectName);
    const templateRoot: string = path.join(this.context.extensionPath, "templates", "invisible-project");
    try {
        await fse.ensureDir(projectRoot);
        await fse.copy(templateRoot, projectRoot);
        await fse.ensureDir(path.join(projectRoot, "lib"));
    } catch (error) {
        window.showErrorMessage(error.message);
        return;
    }
    const openInNewWindow = workspace && !_.isEmpty(workspace.workspaceFolders);
    await commands.executeCommand(Commands.VSCODE_OPEN_FOLDER, Uri.file(path.join(basePath, projectName)), openInNewWindow);
}

const projectTypes: IProjectType[] = [
    {
        displayName: "No build tools",
        detail: "Create a project without any build tools",
        metadata: {
            type: ProjectType.NoBuildTool,
            extensionId: "",
            extensionName: "",
            createCommandId: "",
        },
    },
    {
        displayName: "Maven",
        metadata: {
            type: ProjectType.Maven,
            extensionId: "vscjava.vscode-maven",
            extensionName: "Maven for Java",
            createCommandId: "maven.archetype.generate",
        },
    },
    {
        displayName: "Spring Boot",
        metadata: {
            type: ProjectType.SpringBoot,
            extensionId: "vscjava.vscode-spring-initializr",
            extensionName: "Spring Initializr Java Support",
            createCommandId: "spring.initializr.createProject",
        },
    },
    {
        displayName: "Quarkus",
        metadata: {
            type: ProjectType.Quarkus,
            extensionId: "redhat.vscode-quarkus",
            extensionName: "Quarkus",
            createCommandId: "quarkusTools.createProject",
        },
    },
    {
        displayName: "MicroProfile",
        detail: "Provided by $(extensions) MicroProfile Starter",
        metadata: {
            type: ProjectType.MicroProfile,
            extensionId: "microprofile-community.mp-starter-vscode-ext",
            extensionName: "MicroProfile Starter",
            createCommandId: "extension.microProfileStarter",
        },
    },
];
