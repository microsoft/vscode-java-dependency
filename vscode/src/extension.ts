
import { ExtensionContext, window } from "vscode";
import { Services } from "./services";
import { PackageExplorer } from "./views/packageExplorer";

export function activate(context: ExtensionContext) {
    Services.initialize(context);
    context.subscriptions.push(window.registerTreeDataProvider("javaProjectExplorer", new PackageExplorer(context)));
}
