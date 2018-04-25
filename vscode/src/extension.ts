
import { commands, ExtensionContext, window } from "vscode";
import { Services } from "./services";
import { PackageExplorer } from "./views/packageExplorer";
import { ProjectExplorer } from "./views/projectExplorer";

export function activate(context: ExtensionContext) {
    Services.initialize(context);
    const projectExplorer: ProjectExplorer = new ProjectExplorer(context);
    context.subscriptions.push(window.registerTreeDataProvider("javaProjectExplorer", new PackageExplorer(context)));
    context.subscriptions.push(commands.registerCommand("java.project.create", () => { projectExplorer.createJavaProject(); }));
}
