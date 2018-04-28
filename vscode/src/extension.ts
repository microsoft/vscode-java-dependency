
import { commands, ExtensionContext, Uri, window, workspace } from "vscode";
import { ProjectController } from "./controllers/projectController";
import { Services } from "./services";
import { ProjectExplorer } from "./views/projectExplorer";

export function activate(context: ExtensionContext) {
    Services.initialize(context);
    const projectController: ProjectController = new ProjectController(context);
    context.subscriptions.push(window.registerTreeDataProvider("javaProjectExplorer", new ProjectExplorer(context)));
    context.subscriptions.push(commands.registerCommand("java.project.create", () => { projectController.createJavaProject(); }));
}
