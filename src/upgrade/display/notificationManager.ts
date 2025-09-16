// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, ExtensionContext, window } from "vscode";
import type { IUpgradeIssuesRenderer, UpgradeIssue } from "../type";
import { buildFixPrompt, buildNotificationMessage } from "../utility";
import { Commands } from "../../commands";
import { Settings } from "../../settings";
import { instrumentOperation, sendInfo } from "vscode-extension-telemetry-wrapper";

const KEY_PREFIX = 'javaupgrade.notificationManager';
const NEXT_SHOW_TS_KEY = `${KEY_PREFIX}.nextShowTs`;

const BUTTON_TEXT_UPGRADE = "Upgrade Now";
const BUTTON_TEXT_NOT_NOW = "Not Now";

const SECONDS_IN_A_DAY = 24 * 60 * 60;
const SECONDS_COUNT_BEFORE_NOTIFICATION_RESHOW = 10 * SECONDS_IN_A_DAY;

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

                this.setNextShowTs((Number(new Date()) / 1000) + SECONDS_COUNT_BEFORE_NOTIFICATION_RESHOW);

                if (!this.shouldShow()) {
                    return;
                }

                const prompt = buildFixPrompt(issue);
                const notificationMessage = buildNotificationMessage(issue);
                const selection = await window.showInformationMessage(
                    notificationMessage,
                    BUTTON_TEXT_UPGRADE,
                    BUTTON_TEXT_NOT_NOW);
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
                        this.setNextShowTs(-1 * SECONDS_COUNT_BEFORE_NOTIFICATION_RESHOW);
                        break;
                    }
                }
            }
        ))();
    }

    private shouldShow() {
        return Settings.getEnableDependencyCheckup()
            && ((this.getNextShowTs() ?? 0) <= (Number(new Date()) / 1000));
    }

    private getNextShowTs() {
        return this.context?.globalState.get<number>(NEXT_SHOW_TS_KEY);
    }

    private setNextShowTs(num: number) {
        return this.context?.globalState.update(NEXT_SHOW_TS_KEY, num);
    }
}

const notificationManager = new NotificationManager();
export default notificationManager;