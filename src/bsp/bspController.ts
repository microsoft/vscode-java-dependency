import { Disposable, ExtensionContext, OutputChannel, commands, languages, window, workspace } from "vscode";
import { GradleOutputLinkProvider } from "./GradleOutputLinkProvider";

export class BspController implements Disposable {

    private disposable: Disposable;
    private bsOutputChannel: OutputChannel;

    public constructor(public readonly context: ExtensionContext) {
        this.bsOutputChannel = window.createOutputChannel("Build Output", "gradle-output");
        this.disposable = Disposable.from(
            commands.registerCommand("_java.buildServer.gradle.enabled", () => {
                return workspace.getConfiguration("java.buildServer.gradle").get("enabled", false);
            }),
            commands.registerCommand("_java.buildServer.gradle.buildStart", () => {
                this.bsOutputChannel.appendLine(`> Build started at ${  new Date().toLocaleString()} <\n`);
            }),
            commands.registerCommand("_java.buildServer.gradle.buildComplete", (msg: string) => {
                if (msg) {
                    this.bsOutputChannel.appendLine(msg);
                    this.bsOutputChannel.appendLine('------\n');
                    this.bsOutputChannel.show(true);
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
