// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, window } from "vscode";
import type { UpgradeIssue } from "../type";
import { buildFixPrompt } from "../utility";
import { Commands } from "../../commands";

class NotificationManager {
    private hasShown = false;

    async triggerNotification(projectIssues: Record<string, UpgradeIssue[]>) {
        if (!this.shouldShow()) {
            return;
        }

        const lines = [
            "Fix the following version issues:",
        ];
        for (const [pomPath, issues] of Object.entries(projectIssues)) {
            lines.push("");
            lines.push(`For project "${pomPath}":`);
            const linesForCurrentProject = new Set<string>();
            for (const issue of issues) {
                linesForCurrentProject.add(buildFixPrompt(issue));
            }
            lines.push(...linesForCurrentProject);
            lines.push("\n");
        }

        const prompt = lines.join("\n");
        const projectCount = Object.keys(projectIssues).length;
        const issueCount = Object.values(projectIssues).map(x => x.length).reduce((a, b) => a + b, 0);

        const buttonText = "Upgrade";
        const selection = await window.showInformationMessage(`${issueCount} version issue(s) found in ${projectCount} project(s).`, buttonText);
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