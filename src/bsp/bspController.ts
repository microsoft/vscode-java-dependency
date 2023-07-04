import { ConfigurationTarget, Disposable, ExtensionContext, FileSystemWatcher, OutputChannel, RelativePattern, Uri, commands, languages, window, workspace } from "vscode";
import { GradleOutputLinkProvider } from "./GradleOutputLinkProvider";
import * as path from "path";
import * as fse from "fs-extra";

export class BspController implements Disposable {

    private disposable: Disposable;
    private bsOutputChannel: OutputChannel;
    private watcher: FileSystemWatcher | undefined;

    public constructor(public readonly context: ExtensionContext) {
        this.bsOutputChannel = window.createOutputChannel("Build Output", "gradle-output");
        this.disposable = Disposable.from(
            commands.registerCommand("_java.buildServer.registerFileWatcher", async () => {
                if (this.watcher) {
                    this.watcher.dispose();
                }
                const sourcePaths: ListCommandResult = await commands.executeCommand<ListCommandResult>("java.execute.workspaceCommand", "java.project.listSourcePaths");
                if (sourcePaths?.status) {
                    const sources: string[] = [];
                    for (const sourcePath of sourcePaths.data!) {
                        sources.push(Uri.file(sourcePath.path).fsPath);
                    }
                    this.watcher = workspace.createFileSystemWatcher(new RelativePattern(workspace.workspaceFolders![0], "**/*.java"), false, true, true);
                    this.watcher.onDidCreate(async (uri) => {
                        if (sources.some((source) => uri.fsPath.startsWith(source))) {
                            return;
                        }
                        window.showInformationMessage("Detected new Java files generated, would you like to refresh the project?", "Yes").then((_choice) => {
                            // TODO: 1. find gradle file and reload the project
                            // 2. how to make sure the notification only appear once?
                        });
                    });
                }
            }),
            commands.registerCommand("java.buildServer.openLogs", async () => {
                const storagePath: string | undefined = context.storageUri?.fsPath;
                if (storagePath) {
                    const logFile = path.join(storagePath, "..", "build-server", "bs.log");
                    if (await fse.pathExists(logFile)) {
                        await window.showTextDocument(Uri.file(logFile));
                    } else {
                        window.showErrorMessage("Failed to find build server log file.");
                    }
                }
            }),
            commands.registerCommand("_java.buildServer.gradle.buildStart", (msg: string) => {
                this.bsOutputChannel.appendLine(`> Build started at ${ new Date().toLocaleString()} <\n`);
                this.bsOutputChannel.appendLine(msg);
            }),
            commands.registerCommand("_java.buildServer.gradle.buildProgress", (msg: string) => {
                this.bsOutputChannel.appendLine(msg);
            }),
            commands.registerCommand("_java.buildServer.gradle.buildComplete", (msg: string) => {
                if (msg) {
                    this.bsOutputChannel.appendLine(`\n${msg}`);
                    this.bsOutputChannel.appendLine('------\n');
                    if (msg.includes("BUILD FAILED in")) {
                        this.bsOutputChannel.show(true);
                    }
                }
            }),
            commands.registerCommand("_java.buildServer.configAutoBuild", async () => {
                const choice = await window.showInformationMessage("Would you like to turn off auto build to get the best experience?", "Yes");
                if (choice === "Yes") {
                    await workspace.getConfiguration("java").update("autobuild.enabled", false, ConfigurationTarget.Workspace);
                }
            }),
            this.bsOutputChannel,
            languages.registerDocumentLinkProvider({ language: "gradle-output", scheme: 'output' }, new GradleOutputLinkProvider()),
        );
    }

    public dispose() {
        this.disposable.dispose();
    }
}

interface SourcePath {
    path: string;
    displayPath: string;
    projectName: string;
    projectType: string;
}

interface ListCommandResult {
    data?: SourcePath[];
    status: boolean;
    message: string;
}
