// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, ExtensionContext, window } from "vscode";
import type { IUpgradeIssuesRenderer, UpgradeIssue } from "../type";
import { buildFixPrompt, buildNotificationMessage } from "../utility";
import { Commands } from "../../commands";
import { Settings } from "../../settings";
import { instrumentOperation, sendInfo } from "vscode-extension-telemetry-wrapper";

const KEY_PREFIX = 'javaupgrade.notificationManager';
const SESSION_COUNT_KEY = `${KEY_PREFIX}.sessionCount`;

const BUTTON_TEXT_UPGRADE = "Upgrade Now";
const BUTTON_TEXT_NOT_NOW = "Not Now";
const BUTTON_TEXT_DONT_SHOW_AGAIN = "Don't Show Again";

const SESSION_COUNT_BEFORE_NOTIFICATION_RESHOW = 3;

class NotificationManager implements IUpgradeIssuesRenderer {
    private hasShown = false;
    private context?: ExtensionContext;

    initialize(context: ExtensionContext) {
        this.context = context;
    }

    async render(issues: UpgradeIssue[]) {
        return (instrumentOperation(
            "java.dependency.showUpgradeNotification",
            async (operationId: string) => {
                if (issues.length === 0) {
                    return;
                }
                const issue = issues[0];

                if (this.hasShown) {
                    return;
                }
                this.hasShown = true;

                this.setSessionCount((this.getSessionCount() ?? 0) + 1);

                if (!this.shouldShow()) {
                    return;
                }

                const prompt = buildFixPrompt(issue);
                const notificationMessage = buildNotificationMessage(issue);
                const selection = await window.showInformationMessage(
                    notificationMessage,
                    BUTTON_TEXT_UPGRADE,
                    BUTTON_TEXT_NOT_NOW,
                    BUTTON_TEXT_DONT_SHOW_AGAIN);
                sendInfo(operationId, {
                    operationName: "java.dependency.upgradeNotification.runUpgrade",
                    choice: selection ?? "",
                });

                switch (selection) {
                    case BUTTON_TEXT_UPGRADE: {
                        commands.executeCommand(Commands.JAVA_UPGRADE_WITH_COPILOT, prompt);
                        break;
                    }
                    case BUTTON_TEXT_NOT_NOW: {
                        this.setSessionCount(-1 * SESSION_COUNT_BEFORE_NOTIFICATION_RESHOW);
                        break;
                    }
                    case BUTTON_TEXT_DONT_SHOW_AGAIN: {
                        Settings.disableWorkspaceDependencyDiagnostics();
                        break;
                    }
                }
            }
        ))()
    }

    private shouldShow() {
        return Settings.getEnableDependencyDiagnostics()
            && ((this.getSessionCount() ?? 0) >= 0);
    }

    private getSessionCount() {
        return this.context?.globalState.get<number>(SESSION_COUNT_KEY);
    }

    private setSessionCount(num: number) {
        return this.context?.globalState.update(SESSION_COUNT_KEY, num);
    }
}

const notificationManager = new NotificationManager();
export default notificationManager;