
import { PackageExplorer } from "./views/packageExplorer";
import { ExtensionContext, window } from "vscode";

export function activate(context: ExtensionContext) {
    context.subscriptions.push(window.registerTreeDataProvider('javaProjectExplorer', new PackageExplorer(context)));
}
