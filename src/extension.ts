// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, ExtensionContext, window } from "vscode";
import { Commands } from "./commands";
import { ProjectController } from "./controllers/projectController";
import { Services } from "./services";
import { Telemetry } from "./telemetry";
import { DependencyExplorer } from "./views/depedencyExplorer";

export function activate(context: ExtensionContext) {
    Telemetry.sendEvent("activateExtension", {});
    Services.initialize(context);

    const projectController: ProjectController = new ProjectController(context);
    context.subscriptions.push(commands.registerCommand(Commands.JAVA_PROJECT_CREATE, async () => { projectController.createJavaProject(); }));

    context.subscriptions.push(new DependencyExplorer(context));
}
