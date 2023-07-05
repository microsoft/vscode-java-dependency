import { ConfigurationTarget, Disposable, ExtensionContext, OutputChannel, Uri, commands, languages, window, workspace } from "vscode";
import { GradleOutputLinkProvider } from "./GradleOutputLinkProvider";
import * as path from "path";
import * as fse from "fs-extra";

export class BspController implements Disposable {

    private disposable: Disposable;
    private bsOutputChannel: OutputChannel;

    public constructor(public readonly context: ExtensionContext) {
        this.bsOutputChannel = window.createOutputChannel("Build Output", "gradle-output");
        this.disposable = Disposable.from(
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
                await workspace.getConfiguration("java").update("autobuild.enabled", false, ConfigurationTarget.Workspace);
                window.showInformationMessage("Auto build is turned off to get the best experience. You can reset it later in Settings.");
            }),
            this.bsOutputChannel,
            languages.registerDocumentLinkProvider({ language: "gradle-output", scheme: 'output' }, new GradleOutputLinkProvider()),
        );
    }

    public dispose() {
        this.disposable.dispose();
    }
}
