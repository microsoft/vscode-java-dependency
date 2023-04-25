// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from "fs-extra";
import * as _ from "lodash";
import * as path from "path";
import * as semver from "semver";
import { commands, Disposable, Extension, ExtensionContext, extensions, QuickPickItem, Uri, window, workspace } from "vscode";
import { instrumentOperationAsVsCodeCommand, sendInfo } from "vscode-extension-telemetry-wrapper";
import { Commands } from "../commands";
import { Utility } from "../utility";

export class ProjectController implements Disposable {

    private disposable: Disposable;

    public constructor(public readonly context: ExtensionContext) {
        this.disposable = Disposable.from(
            instrumentOperationAsVsCodeCommand(Commands.JAVA_PROJECT_CREATE, () => this.createJavaProject()),
            instrumentOperationAsVsCodeCommand(Commands.JAVA_PROJECT_OPEN, () => this.openJavaProject()),
            instrumentOperationAsVsCodeCommand(Commands.INSTALL_EXTENSION, (extensionId: string) => {
                commands.executeCommand("workbench.extensions.installExtension", extensionId);
                // So far there is no API to query the extension's state, so we open the extension's homepage
                // here, where users can check the state: installing, disabled, installed, etc...
                // See: https://github.com/microsoft/vscode/issues/14444
                commands.executeCommand("extension.open", extensionId);
            }),
        );
    }

    public dispose() {
        this.disposable.dispose();
    }

    public async openJavaProject() {
        const availableCommands: string[] = await commands.getCommands();
        if (availableCommands.includes(Commands.WORKBENCH_ACTION_FILES_OPENFOLDER)) {
            return commands.executeCommand(Commands.WORKBENCH_ACTION_FILES_OPENFOLDER);
        }
        return commands.executeCommand(Commands.WORKBENCH_ACTION_FILES_OPENFILEFOLDER);
    }

    public async createJavaProject() {
        const items: IProjectTypeQuickPick[] = projectTypes.map((type: IProjectType) => {
            return {
                label: type.displayName,
                description: type.description,
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
        sendInfo("", {projectCreationType: choice.metadata.type});
        if (choice.metadata.type === ProjectType.NoBuildTool) {
            await scaffoldSimpleProject(this.context);
        } else if (choice.metadata.createCommandId && choice.metadata.createCommandArgs) {
            await commands.executeCommand(choice.metadata.createCommandId, ...choice.metadata.createCommandArgs);
        } else if (choice.metadata.createCommandId) {
            await commands.executeCommand(choice.metadata.createCommandId);
        }
    }
}

interface IProjectType {
    displayName: string;
    description?: string;
    detail?: string;
    metadata: IProjectTypeMetadata;
}

interface IProjectTypeMetadata {
    type: ProjectType;
    extensionId: string;
    extensionName: string;
    leastExtensionVersion?: string;
    createCommandId: string;
    createCommandArgs?: any[];
}

interface IProjectTypeQuickPick extends QuickPickItem {
    metadata: IProjectTypeMetadata;
}

enum ProjectType {
    NoBuildTool = "NoBuildTool",
    Maven = "Maven",
    Gradle = "Gradle",
    SpringBoot = "SpringBoot",
    Quarkus = "Quarkus",
    MicroProfile = "MicroProfile",
    JavaFX = "JavaFX",
    Micronaut = "Micronaut",
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

    if (metaData.leastExtensionVersion && semver.lt(extension.packageJSON.version, metaData.leastExtensionVersion)) {
        await promptUpdateExtension(typeName, metaData);
        return false;
    }

    await extension.activate();
    return true;
}

async function promptInstallExtension(projectType: string, metaData: IProjectTypeMetadata): Promise<void> {
    const choice: string | undefined = await window.showInformationMessage(`${metaData.extensionName} is required to create ${projectType} projects. Please re-run the command 'Java: Create Java Project...' after the extension is installed.`, "Install");
    if (choice === "Install") {
        commands.executeCommand(Commands.INSTALL_EXTENSION, metaData.extensionId);
    }
}

async function promptUpdateExtension(projectType: string, metaData: IProjectTypeMetadata): Promise<void> {
    const choice: string | undefined = await window.showInformationMessage(`${metaData.extensionName} needs to be updated to create ${projectType} projects. Please re-run the command 'Java: Create Java Project...' after the extension is updated.`, "Update");
    if (choice === "Update") {
        commands.executeCommand(Commands.INSTALL_EXTENSION, metaData.extensionId);
    }
}

async function scaffoldSimpleProject(context: ExtensionContext): Promise<void> {
    const workspaceFolder = Utility.getDefaultWorkspaceFolder();
    const location: Uri[] | undefined = await window.showOpenDialog({
        defaultUri: workspaceFolder && workspaceFolder.uri,
        canSelectFiles: false,
        canSelectFolders: true,
        openLabel: "Select the project location",
    });
    if (!location || !location.length) {
        return;
    }

    const basePath: string = location[0].fsPath;
    const projectName: string | undefined = await window.showInputBox({
        prompt: "Input a Java project name",
        ignoreFocusOut: true,
        validateInput: async (name: string): Promise<string> => {
            if (name && !name.match(/^[^*~/\\]+$/)) {
                return "Please input a valid project name";
            }
            if (name && await fse.pathExists(path.join(basePath, name))) {
                return "A project with this name already exists";
            }
            return "";
        },
    });

    if (!projectName) {
        return;
    }

    const projectRoot: string = path.join(basePath, projectName);
    const templateRoot: string = path.join(context.extensionPath, "templates", "invisible-project");
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
        detail: "Work with source code directly without any build tools",
        metadata: {
            type: ProjectType.NoBuildTool,
            extensionId: "",
            extensionName: "",
            createCommandId: "",
        },
    },
    {
        displayName: "Maven",
        description: "create from archetype",
        metadata: {
            type: ProjectType.Maven,
            extensionId: "vscjava.vscode-maven",
            extensionName: "Maven for Java",
            createCommandId: "maven.archetype.generate",
        },
    },
    {
        displayName: "Gradle",
        metadata: {
            type: ProjectType.Gradle,
            extensionId: "vscjava.vscode-gradle",
            extensionName: "Gradle for Java",
            leastExtensionVersion: "3.10.0",
            createCommandId: "gradle.createProject",
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
        metadata: {
            type: ProjectType.MicroProfile,
            extensionId: "microprofile-community.mp-starter-vscode-ext",
            extensionName: "MicroProfile Starter",
            createCommandId: "extension.microProfileStarter",
        },
    },
    {
        displayName: "JavaFX",
        description: "create from archetype",
        metadata: {
            type: ProjectType.JavaFX,
            extensionId: "vscjava.vscode-maven",
            extensionName: "Maven for Java",
            leastExtensionVersion: "0.35.0",
            createCommandId: "maven.archetype.generate",
            createCommandArgs: [{
                archetypeGroupId: "org.openjfx",
                archetypeArtifactId: "javafx-archetype-fxml",
                archetypeVersion: "RELEASE",
            }],
        },
    },
    {
        displayName: "Micronaut",
        metadata: {
            type: ProjectType.Micronaut,
            extensionId: "oracle-labs-graalvm.micronaut",
            extensionName: "GraalVM Tools for Micronaut",
            createCommandId: "extension.micronaut.createProject",
        },
    },
];
