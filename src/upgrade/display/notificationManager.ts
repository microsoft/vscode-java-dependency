// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, window } from "vscode";
import type { UpgradeIssue } from "../type";
import { buildFixPrompt, buildNotificationMessage } from "../utility";
import { Commands } from "../../commands";

class NotificationManager {
    private hasShown = false;

    async triggerNotification(issue: UpgradeIssue) {
        if (!this.shouldShow()) {
            return;
        }

        const prompt = buildFixPrompt(issue);
        const notificationMessage = buildNotificationMessage(issue);
        const buttonText = "Upgrade";

        const selection = await window.showInformationMessage(notificationMessage, buttonText);
        this.hasShown = true;
        if (selection === buttonText) {
            commands.executeCommand(Commands.VIEW_TRIGGER_JAVA_UPGRADE_TOOL, prompt);
        }
    }

    private shouldShow() {
        // TODO: fix
        return !this.hasShown;
    }
}

const notificationManager = new NotificationManager();
export default notificationManager;