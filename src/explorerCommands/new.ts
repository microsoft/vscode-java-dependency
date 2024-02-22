// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from "fs-extra";
import { userInfo } from "os";
import * as path from "path";
import { commands, Extension, extensions, languages, Position, QuickPickItem, QuickPickItemKind, SnippetString, TextEditor, Uri,
    window, workspace, WorkspaceEdit, WorkspaceFolder } from "vscode";
import { Commands, PrimaryTypeNode } from "../../extension.bundle";
import { ExtensionName } from "../constants";
import { NodeKind } from "../java/nodeData";
import { DataNode } from "../views/dataNode";
import { resourceRoots } from "../views/packageRootNode";
import { checkJavaQualifiedName } from "./utility";
import { sendError, sendInfo, setUserError } from "vscode-extension-telemetry-wrapper";

// tslint:disable no-var-requires
const stringInterpolate = require("fmtr");

export class JavaType {
    public static readonly CLASS: JavaType = new JavaType("Class", "class", "$(symbol-class)");
    public static readonly INTERFACE: JavaType = new JavaType("Interface", "interface", "$(symbol-interface)");
    public static readonly ENUM: JavaType = new JavaType("Enum", "enum", "$(symbol-enum)");
    public static readonly RECORD: JavaType = new JavaType("Record", "record", "$(symbol-class)");
    public static readonly ANNOTATION: JavaType = new JavaType("Annotation", "@interface", "$(symbol-interface)");
    public static readonly ABSTRACT_CLASS: JavaType = new JavaType("Abstract Class", "abstract class", "$(symbol-class)");

    public static readonly ALL: JavaType[] = [
        JavaType.CLASS,
        JavaType.INTERFACE,
        JavaType.ENUM,
        JavaType.RECORD,
        JavaType.ANNOTATION,
        JavaType.ABSTRACT_CLASS,
    ];

    public static fromDisplayName(label: string): JavaType | undefined {
        if (label?.startsWith("$")) {
            return JavaType.ALL.find((javaType) => `${javaType.icon} ${javaType.label}` === label);
        }

        return JavaType.ALL.find((javaType) => javaType.label === label);
    }

    public static getDisplayNames(includeIcon: boolean, includeRecord?: boolean): string[] {
        return JavaType.ALL
            .filter((javaType) => includeRecord || javaType !== JavaType.RECORD)
            .map((javaType) => {
                if (includeIcon) {
                    return `${javaType.icon} ${javaType.label}`;
                } else {
                    return javaType.label;
                }
            });
    }

    private constructor(public readonly label: string, public readonly keyword: string,
                        public readonly icon: string) {
    }
}

export async function newResource(node: DataNode): Promise<void> {
    const availableTypes: QuickPickItem[] = [];
    // add options for Java nodes
    if (node.nodeData.kind === NodeKind.Project ||
            (node.nodeData.kind === NodeKind.PackageRoot && !resourceRoots.includes(node.nodeData.name)) ||
            node.nodeData.kind === NodeKind.Package ||
            node.nodeData.kind === NodeKind.PrimaryType ||
            node.nodeData.kind === NodeKind.CompilationUnit) {
        const allowRecord = node.computeContextValue()?.includes("+allowRecord");
        availableTypes.push(...JavaType.getDisplayNames(true, allowRecord).map((label) => {
            return {
                label,
            };
        }));
        availableTypes.push({
            label: "$(symbol-namespace) Package",
        });
    }

    availableTypes.push({
        label: "",
        kind: QuickPickItemKind.Separator,
    });
    // add new file option
    availableTypes.push({
        label: "$(file) File",
    });

    // add new folder option
    if (node.nodeData.kind === NodeKind.Project ||
            (node.nodeData.kind === NodeKind.PackageRoot && resourceRoots.includes(node.nodeData.name)) ||
            node.nodeData.kind === NodeKind.Folder ||
            node.nodeData.kind === NodeKind.File) {
        availableTypes.push({
            label: "$(folder) Folder",
        });
    }

    const type = await window.showQuickPick(
        availableTypes,
        {
            placeHolder: "Select resource type to create.",
            ignoreFocusOut: true,
        }
    );

    switch (type?.label) {
        case "$(symbol-namespace) Package":
            await newPackage(node);
            break;
        case "$(file) File":
            await newFile(node);
            break;
        case "$(folder) Folder":
            await newFolder(node);
            break;
        default:
            const javaType = JavaType.fromDisplayName(type?.label || "");
            if (javaType) {
                await newJavaFileWithSpecificType(javaType, node);
            }
            break;
    }
}

// Create a new Java file from the menu bar.
export async function newJavaFile(): Promise<void> {
    const packageFsPath: string | undefined = await inferPackageFsPath();
    if (packageFsPath === undefined) {
        // User canceled
        return;
    } else if (packageFsPath.length === 0) {
        return newUntitledJavaFile();
    }

    const includeRecord = isLanguageServerReady() && !(await isVersionLessThan(Uri.file(packageFsPath).toString(), 16));
    const supportedTypes: string[] = JavaType.getDisplayNames(true, includeRecord);
    const typeName: string | undefined = await window.showQuickPick(supportedTypes,
            {
                placeHolder: "Select the Java type you want to create",
                ignoreFocusOut: true,
            });
    if (!typeName) {
        return;
    }

    newJavaFile0(packageFsPath, JavaType.fromDisplayName(typeName));
}

// Create a new Java file from the context menu of Java Projects view or File Explorer.
export async function newJavaFileWithSpecificType(javaType: JavaType, node?: DataNode | Uri): Promise<void> {
    sendInfo("", {
        "triggernewfilefrom": (node instanceof Uri && node?.fsPath) ? "fileExplorer" : "javaProjectExplorer",
        "javatype": javaType.label,
    });
    let packageFsPath: string | undefined;
    if (!node) {
        packageFsPath = await inferPackageFsPath();
    } else if (node instanceof Uri && node?.fsPath) { // File Explorer
        packageFsPath = node?.fsPath;
    } else if (node instanceof DataNode) { // Java Projects view
        if (!node?.uri || !canCreateClass(node)) {
            return;
        }
        packageFsPath = await getPackageFsPath(node);
    }
    if (packageFsPath === undefined) {
        // User canceled
        return;
    } else if (packageFsPath.length === 0) {
        return newUntitledJavaFile();
    }

    newJavaFile0(packageFsPath, javaType);
}

async function newJavaFile0(packageFsPath: string, javaType: JavaType | undefined) {
    if (!javaType) {
        return;
    }

    const className: string | undefined = await window.showInputBox({
        placeHolder: `Input the ${javaType.label.toLowerCase()} name`,
        ignoreFocusOut: true,
        validateInput: async (value: string): Promise<string> => {
            const checkMessage: string = checkJavaQualifiedName(value);
            if (checkMessage) {
                return checkMessage;
            }

            if (await fse.pathExists(getNewFilePath(packageFsPath!, value))) {
                return "Class already exists.";
            }

            return "";
        },
    });

    if (!className) {
        return;
    }

    const fsPath: string = getNewFilePath(packageFsPath, className);
    const packageName = await resolvePackageName(fsPath);
    await newJavaFileWithContents(fsPath, javaType, packageName);
}

// New File implementation is copied from
// https://github.com/redhat-developer/vscode-java/blob/86bf3ae02f4f457184e6cc217f20240f9882dde9/src/fileEventHandler.ts#L66
async function newJavaFileWithContents(fsPath: string, javaType: JavaType, packageName: string) {
    const snippets: string[] = [];
    const formatNumber = (num: number) => num > 9 ? String(num) : `0${num}`;
    const typeName: string = resolveTypeName(fsPath);
    const isPackageInfo = typeName === 'package-info';
    const isModuleInfo = typeName === 'module-info';
    const date = new Date();
    const context: any = {
        fileName: path.basename(fsPath),
        packageName: "",
        typeName,
        user: userInfo().username,
        date: date.toLocaleDateString(undefined, {month: "short", day: "2-digit", year: "numeric"}),
        time: date.toLocaleTimeString(),
        year: date.getFullYear(),
        month: formatNumber(date.getMonth() + 1),
        shortmonth: date.toLocaleDateString(undefined, {month: "short"}),
        day: formatNumber(date.getDate()),
        hour: formatNumber(date.getHours()),
        minute: formatNumber(date.getMinutes()),
    };

    if (!isModuleInfo) {
        context.packageName = packageName;
    }

    const fileHeader = workspace.getConfiguration('java').get<string[]>("templates.fileHeader");
    if (fileHeader && fileHeader.length) {
        for (const template of fileHeader) {
            snippets.push(stringInterpolate(template, context));
        }
    }

    if (!isModuleInfo) {
        if (context.packageName) {
            snippets.push(`package ${context.packageName};`);
            snippets.push("");
        }
    }

    if (!isPackageInfo) {
        const typeComment = workspace.getConfiguration('java').get<string[]>("templates.typeComment");
        if (typeComment && typeComment.length) {
            for (const template of typeComment) {
                snippets.push(stringInterpolate(template, context));
            }
        }

        if (isModuleInfo) {
            snippets.push(`module {`);
        } else {
            snippets.push(`public ${javaType.keyword} ${typeName}${javaType === JavaType.RECORD ? "()" : ""} {`);
        }
        snippets.push("");
        snippets.push("}");
        snippets.push("");
    }

    const workspaceEdit: WorkspaceEdit = new WorkspaceEdit();
    const fsUri: Uri = Uri.file(fsPath);
    workspaceEdit.createFile(fsUri);
    workspaceEdit.insert(fsUri, new Position(0, 0), snippets.join("\n"));
    await workspace.applyEdit(workspaceEdit);
    const editor = await window.showTextDocument(fsUri);
    if (editor) {
        editor.document.save();
    }
}

function resolveTypeName(filePath: string): string {
    const fileName: string = path.basename(filePath);
    const extName: string = path.extname(fileName);
    return fileName.substring(0, fileName.length - extName.length);
}

async function newUntitledJavaFile(): Promise<void> {
    await commands.executeCommand("workbench.action.files.newUntitledFile");
    const textEditor: TextEditor | undefined = window.activeTextEditor;
    if (!textEditor) {
        return;
    }
    await languages.setTextDocumentLanguage(textEditor.document, "java");
    const snippets: string[] = [];
    snippets.push(`public \${1|class,interface,enum,abstract class,@interface|} \${2:Main} {`);
    snippets.push(`\t\${0}`);
    snippets.push("}");
    snippets.push("");
    textEditor.insertSnippet(new SnippetString(snippets.join("\n")));
}

function isLanguageServerReady(): boolean {
    const javaLanguageSupport: Extension<any> | undefined = extensions.getExtension(ExtensionName.JAVA_LANGUAGE_SUPPORT);
    if (!javaLanguageSupport || !javaLanguageSupport.isActive) {
        return false;
    }

    const extensionApi: any = javaLanguageSupport.exports;
    if (!extensionApi) {
        return false;
    }

    if (extensionApi.serverMode !== "Standard" || extensionApi.status !== "Started") {
        return false;
    }

    return true;
}

async function inferPackageFsPath(): Promise<string> {
    if (!isLanguageServerReady()) {
        return getPackageFsPathFromActiveEditor();
    }

    let sourcePaths: string[] | undefined;
    try {
        const result = await commands.executeCommand<IListCommandResult>(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.LIST_SOURCEPATHS);
        if (result && result.data && result.data.length) {
            sourcePaths = result.data.map((entry) => entry.path);
        }
    } catch (e) {
        // do nothing
    }

    if (!window.activeTextEditor) {
        if (sourcePaths?.length === 1) {
            return sourcePaths[0];
        }
        return "";
    }

    const fileUri: Uri = window.activeTextEditor.document.uri;
    const workspaceFolder: WorkspaceFolder | undefined = workspace.getWorkspaceFolder(fileUri);
    if (!workspaceFolder) {
        return "";
    }

    const filePath: string = window.activeTextEditor.document.uri.fsPath;
    if (sourcePaths) {
        for (const sourcePath of sourcePaths) {
            if (!path.relative(sourcePath, filePath).startsWith("..")) {
                return path.dirname(window.activeTextEditor.document.uri.fsPath);
            }
        }
    }

    return "";
}

function getPackageFsPathFromActiveEditor() {
    if (!window.activeTextEditor) {
        return "";
    }

    const fileUri: Uri = window.activeTextEditor.document.uri;
    const workspaceFolder: WorkspaceFolder | undefined = workspace.getWorkspaceFolder(fileUri);
    if (!workspaceFolder) {
        return "";
    }

    const filePath: string = window.activeTextEditor.document.uri.fsPath;
    if (filePath.endsWith(".java")) {
        return path.dirname(filePath);
    }

    return "";
}

function canCreateClass(node: DataNode): boolean {
    if (node.nodeData.kind === NodeKind.Project ||
        node.nodeData.kind === NodeKind.PackageRoot ||
        node.nodeData.kind === NodeKind.Package ||
        node.nodeData.kind === NodeKind.PrimaryType) {
        return true;
    }

    return false;
}

const COMPLIANCE = "org.eclipse.jdt.core.compiler.compliance";
async function isVersionLessThan(fileUri: string, targetVersion: number): Promise<boolean> {
    let projectSettings: any = {};
    try {
        projectSettings = await commands.executeCommand<any>(
            Commands.EXECUTE_WORKSPACE_COMMAND, Commands.GET_PROJECT_SETTINGS, fileUri, [ COMPLIANCE ]);
    } catch (err) {
        // do nothing.
    }

    let javaVersion = 0;
    let complianceVersion = projectSettings[COMPLIANCE];
    if (complianceVersion) {
        // Ignore '1.' prefix for legacy Java versions
        if (complianceVersion.startsWith('1.')) {
            complianceVersion = complianceVersion.substring(2);
        }

        // look into the interesting bits now
        const regexp = /\d+/g;
        const match = regexp.exec(complianceVersion);
        if (match) {
            javaVersion = parseInt(match[0], 10);
        }
    }

    return javaVersion < targetVersion;
}

async function resolvePackageName(filePath: string): Promise<string> {
    if (!isLanguageServerReady()) {
        return guessPackageName(filePath);
    }

    let sourcePaths: string[] = [];
    const result: IListCommandResult =
            await commands.executeCommand<IListCommandResult>(Commands.EXECUTE_WORKSPACE_COMMAND, Commands.LIST_SOURCEPATHS);
    if (result && result.data && result.data.length) {
        sourcePaths = result.data.map((sourcePath) => sourcePath.path).sort((a, b) => b.length - a.length);
    }

    if (!sourcePaths || !sourcePaths.length) {
        return "";
    }

    for (const sourcePath of sourcePaths) {
        if (isPrefix(sourcePath, filePath)) {
            const relative = path.relative(sourcePath, path.dirname(filePath));
            return relative.replace(/[/\\]/g, ".");
        }
    }

    return "";
}

function guessPackageName(filePath: string): string {
    const packagePath: string = path.dirname(filePath);
    const knownSourcePathPrefixes: string[] = [
        "src/main/java/",
        "src/test/java/",
        "src\\main\\java\\",
        "src\\test\\java\\",
    ];

    for (const prefix of knownSourcePathPrefixes) {
        const index: number = packagePath.lastIndexOf(prefix);
        if (index > -1) {
            return packagePath.substring(index + prefix.length).replace(/[\\\/]/g, ".");
        }
    }

    return "";
}

function isPrefix(parentPath: string, filePath: string): boolean {
    const relative = path.relative(parentPath, filePath);
    return !relative || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function getPackageFsPath(node: DataNode): Promise<string | undefined> {
    if (node.nodeData.kind === NodeKind.Project) {
        const childrenNodes: DataNode[] = await node.getChildren() as DataNode[];
        const packageRoots: any[] = childrenNodes.filter((child) => {
            return child.nodeData.kind === NodeKind.PackageRoot && !resourceRoots.includes(child.name);
        });
        if (packageRoots.length < 1) {
            // This might happen for an invisible project with "_" as its root
            const packageNode: DataNode | undefined = childrenNodes.find((child) => {
                return child.nodeData.kind === NodeKind.Package;
            });
            if (!packageNode && node.uri) {
                // This means the .java files are in the default package.
                return Uri.parse(node.uri).fsPath;
            } else if (packageNode?.uri) {
                return getPackageRootPath(Uri.parse(packageNode.uri).fsPath, packageNode.name);
            }
            return "";
        } else if (packageRoots.length === 1) {
            return Uri.parse(packageRoots[0].uri).fsPath;
        } else {
            const options: ISourceRootPickItem[] = packageRoots.map((root) => {
                return {
                    label: root.name,
                    fsPath: Uri.parse(root.uri).fsPath,
                };
            });
            const choice: ISourceRootPickItem | undefined = await window.showQuickPick(options, {
                    placeHolder: "Choose a source folder",
                    ignoreFocusOut: true,
                },
            );
            return choice?.fsPath;
        }
    } else if (node.nodeData.kind === NodeKind.PrimaryType) {
        return node.uri ? path.dirname(Uri.parse(node.uri).fsPath) : "";
    }

    return node.uri ? Uri.parse(node.uri).fsPath : "";
}

function getNewFilePath(basePath: string, className: string): string {
    if (className.endsWith(".java")) {
        className = className.substr(0, className.length - ".java".length);
    }
    return path.join(basePath, ...className.split(".")) + ".java";
}

export async function newPackage(node?: DataNode): Promise<void> {
    if (!node?.uri || !canCreatePackage(node)) {
        return;
    }

    let defaultValue: string;
    let packageRootPath: string;
    const nodeKind = node.nodeData.kind;
    if (nodeKind === NodeKind.Project) {
        defaultValue = "";
        packageRootPath = await getPackageFsPath(node) || "";
    } else if (nodeKind === NodeKind.PackageRoot) {
        defaultValue = "";
        packageRootPath = Uri.parse(node.uri).fsPath;
    } else if (nodeKind === NodeKind.Package) {
        defaultValue = node.nodeData.name + ".";
        packageRootPath = getPackageRootPath(Uri.parse(node.uri).fsPath, node.nodeData.name);
    } else if (nodeKind === NodeKind.PrimaryType) {
        const primaryTypeNode = <PrimaryTypeNode> node;
        packageRootPath = primaryTypeNode.getPackageRootPath();
        if (packageRootPath === "") {
            window.showErrorMessage("Failed to get the package root path.");
            return;
        }
        const packagePath = await getPackageFsPath(node);
        if (!packagePath) {
            window.showErrorMessage("Failed to get the package path.");
            return;
        }
        defaultValue = path.relative(packageRootPath, packagePath).replace(/[\\\/]/g, ".") + ".";
    } else {
        return;
    }

    const packageName: string | undefined = await window.showInputBox({
        value: defaultValue,
        placeHolder: "Input the package name",
        valueSelection: [defaultValue.length, defaultValue.length],
        ignoreFocusOut: true,
        validateInput: async (value: string): Promise<string> => {
            const checkMessage: string = checkJavaQualifiedName(value);
            if (checkMessage) {
                return checkMessage;
            }

            if (await fse.pathExists(getNewPackagePath(packageRootPath, value))) {
                return "Package already exists.";
            }

            return "";
        },
    });

    if (!packageName) {
        return;
    }

    await fse.ensureDir(getNewPackagePath(packageRootPath, packageName));
}

/**
 * Check if the create package command is available for the given node.
 * Currently the check logic is the same as the create class command.
 */
function canCreatePackage(node: DataNode): boolean {
    return canCreateClass(node);
}

function getPackageRootPath(packageFsPath: string, packageName: string): string {
    const numberOfSegment: number = packageName.split(".").length;
    return path.join(packageFsPath, ...Array(numberOfSegment).fill(".."));
}

function getNewPackagePath(packageRootPath: string, packageName: string): string {
    return path.join(packageRootPath, ...packageName.split("."));
}

interface ISourceRootPickItem extends QuickPickItem {
    fsPath: string;
}

interface IListCommandResult {
    status: boolean;
    message: string;
    data?: ISourcePath[];
}

interface ISourcePath {
    path: string;
    displayPath: string;
    projectName: string;
    projectType: string;
}

export async function newFile(node: DataNode): Promise<void> {
    const basePath = getBasePath(node);
    if (!basePath) {
        window.showErrorMessage("The selected node is invalid.");
        return;
    }

    const fileName: string | undefined = await window.showInputBox({
        placeHolder: "Input the file name",
        ignoreFocusOut: true,
        validateInput: async (value: string): Promise<string> => {
            return validateNewFileFolder(basePath, value);
        },
    });

    if (!fileName) {
        return;
    }

    // any continues separator will be deduplicated.
    const relativePath = fileName.replace(/[/\\]+/g, path.sep);
    const newFilePath = path.join(basePath, relativePath);
    await createFile(newFilePath);
}

async function createFile(newFilePath: string) {
    fse.createFile(newFilePath, async (err: Error) => {
        if (err) {
            setUserError(err);
            sendError(err);
            const choice = await window.showErrorMessage(
                err.message || "Failed to create file: " + path.basename(newFilePath),
                "Retry"
            );
            if (choice === "Retry") {
                await createFile(newFilePath);
            }
        } else {
            window.showTextDocument(Uri.file(newFilePath));
        }
    });
}

export async function newFolder(node: DataNode): Promise<void> {
    const basePath = getBasePath(node);
    if (!basePath) {
        window.showErrorMessage("The selected node is invalid.");
        return;
    }

    const folderName: string | undefined = await window.showInputBox({
        placeHolder: "Input the folder name",
        ignoreFocusOut: true,
        validateInput: async (value: string): Promise<string> => {
            return validateNewFileFolder(basePath, value);
        },
    });

    if (!folderName) {
        return;
    }

    // any continues separator will be deduplicated.
    const relativePath = folderName.replace(/[/\\]+/g, path.sep);
    const newFolderPath = path.join(basePath, relativePath);
    fse.mkdirs(newFolderPath);
}

async function validateNewFileFolder(basePath: string, relativePath: string): Promise<string> {
    relativePath = relativePath.replace(/[/\\]+/g, path.sep);
    if (await fse.pathExists(path.join(basePath, relativePath))) {
        return "A file or folder already exists in the target location.";
    }

    return "";
}

function getBasePath(node: DataNode): string | undefined {
    if (!node.uri) {
        return undefined;
    }

    const uri: Uri = Uri.parse(node.uri);
    if (uri.scheme !== "file") {
        return undefined;
    }

    const nodeKind = node.nodeData.kind;
    switch (nodeKind) {
        case NodeKind.Project:
        case NodeKind.PackageRoot:
        case NodeKind.Package:
        case NodeKind.Folder:
            return Uri.parse(node.uri!).fsPath;
        case NodeKind.PrimaryType:
        case NodeKind.File:
            return path.dirname(Uri.parse(node.uri).fsPath);
        default:
            return undefined;
    }
}
