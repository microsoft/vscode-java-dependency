// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, window } from "vscode";
import type { FileIssues } from "../type";
import { buildFixPrompt, buildMessage } from "../utility";
import { Commands } from "../../commands";

class NotificationManager {
    private hasShown = false;


    async refresh(issues: FileIssues) {
        const targetIssue = Object.values(issues)[0];

        if (!targetIssue) {
            return;
        }

        if (this.hasShown) {
            return;
        }

        const buttonText = "Upgrade";
        const selection = await window.showInformationMessage(buildMessage(targetIssue), buttonText);
        this.hasShown = true;
        if (selection === buttonText) {
            commands.executeCommand(Commands.VIEW_TRIGGER_JAVA_UPGRADE_TOOL, buildFixPrompt(targetIssue));
        }
    }
}

const notificationManager = new NotificationManager();
export default notificationManager;