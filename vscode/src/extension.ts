
import { PackageExplorer } from "./views/packageExplorer";
import { ExtensionContext, window } from "vscode";
import { Services } from "./services";

export function activate(context: ExtensionContext) {
    Services.initialize(context);
    context.subscriptions.push(window.registerTreeDataProvider('javaProjectExplorer', new PackageExplorer(context)));
}
