// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, ExtensionContext, window } from "vscode";
import type { UpgradeIssue } from "../type";
import { buildFixPrompt, buildNotificationMessage } from "../utility";
import { Commands } from "../../commands";
import { Upgrade } from "../../constants";

const KEY_PREFIX = 'javaupgrade.notificationManager';
const IS_CANDIDATE_KEY = `${KEY_PREFIX}.isCandidate`;
const SESSION_COUNT_KEY = `${KEY_PREFIX}.sessionCount`;

const BUTTON_TEXT_UPGRADE = "Upgrade Now";
const BUTTON_TEXT_NOT_NOW = "Not Now";
const BUTTON_TEXT_DONT_SHOW_AGAIN = "Don't Show Again";

class NotificationManager {
    private hasShown = false;
    private context?: ExtensionContext;

    initialize(context: ExtensionContext) {
        this.context = context;
    }

    async triggerNotification(issue: UpgradeIssue) {
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

        switch (selection) {
            case BUTTON_TEXT_UPGRADE: {
                commands.executeCommand(Commands.VIEW_TRIGGER_JAVA_UPGRADE_TOOL, prompt);
                break;
            }
            case BUTTON_TEXT_NOT_NOW: {
                this.setSessionCount(-1 * Upgrade.SESSION_COUNT_BEFORE_NOTIFICATION_RESHOW);
                break;
            }
            case BUTTON_TEXT_DONT_SHOW_AGAIN: {
                this.setCandidate(false);
                break;
            }
        }

    }

    private shouldShow() {
        return this.isCandidate()
            && ((this.getSessionCount() ?? 0) >= 0);
    }

    private getSessionCount() {
        return this.context?.globalState.get<number>(SESSION_COUNT_KEY);
    }

    private setSessionCount(num: number) {
        return this.context?.globalState.update(SESSION_COUNT_KEY, num);
    }

    private isCandidate() {
        return this.context?.globalState.get<boolean>(IS_CANDIDATE_KEY, true);
    }

    private setCandidate(isCandidate: boolean) {
        this.context?.globalState.update(IS_CANDIDATE_KEY, isCandidate);
    }
}

const notificationManager = new NotificationManager();
export default notificationManager;