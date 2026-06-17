// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, ExtensionContext, window } from "vscode";
import { UpgradeReason, type IUpgradeIssuesRenderer, type UpgradeIssue } from "../type";
import { buildCVENotificationMessage, buildFixPrompt, buildNotificationMessage, getExtensionState, type ExtensionState } from "../utility";
import { Commands } from "../../commands";
import { Settings } from "../../settings";
import { instrumentOperation, sendInfo } from "vscode-extension-telemetry-wrapper";
import { ExtensionName, Upgrade } from "../../constants";
import { CveUpgradeIssue } from "../cve";

const KEY_PREFIX = 'javaupgrade.notificationManager';
const NEXT_SHOW_TS_KEY = `${KEY_PREFIX}.nextShowTs`;

const BUTTON_TEXT_NOT_NOW = "Not Now";

// Action button label keyed by the install state of the app modernization extension.
const UPGRADE_BUTTON_TEXT: Record<ExtensionState, string> = {
    "up-to-date": "Upgrade Now",
    "outdated": "Update Extension and Upgrade",
    "not-installed": "Install Extension and Upgrade",
};
const FIX_CVE_BUTTON_TEXT: Record<ExtensionState, string> = {
    "up-to-date": "Fix Now",
    "outdated": "Update Extension and Fix",
    "not-installed": "Install Extension and Fix",
};

const SECONDS_IN_A_DAY = 24 * 60 * 60;
const SECONDS_COUNT_BEFORE_NOTIFICATION_RESHOW = 10 * SECONDS_IN_A_DAY;

function getNowTs() {
    return Number(new Date()) / 1000;
}

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

                if (!this.shouldShow() || this.hasShown) {
                    return;
                }
                this.hasShown = true;

                // Prefer Java upgrade recommendations over CVE fixes: only fall back
                // to a CVE notification when there is no upgrade issue to recommend.
                const cveIssues = issues.filter(
                        (i): i is CveUpgradeIssue => i.reason === UpgradeReason.CVE
                    );
                const upgradeIssues = issues.filter(
                        (i) => i.reason !== UpgradeReason.CVE
                    );
                const isCVE = upgradeIssues.length === 0;
                const issue = isCVE ? cveIssues[0] : upgradeIssues[0];

                const extensionState = getExtensionState(ExtensionName.APP_MODERNIZATION_UPGRADE_FOR_JAVA);
                const source = isCVE ? Upgrade.SOURCE_CVE : Upgrade.SOURCE_JAVA_UPGRADE;
                const notificationMessage = isCVE
                    ? buildCVENotificationMessage(cveIssues, extensionState)
                    : buildNotificationMessage(issue, extensionState);
                const actionButtonText = isCVE
                    ? FIX_CVE_BUTTON_TEXT[extensionState]
                    : UPGRADE_BUTTON_TEXT[extensionState];

                sendInfo(operationId, {
                    operationName: "java.dependency.upgradeNotification.show",
                    extensionState,
                    source,
                });

                const selection = await window.showInformationMessage(
                        notificationMessage,
                        actionButtonText,
                        BUTTON_TEXT_NOT_NOW
                    );
                sendInfo(operationId, {
                    operationName: "java.dependency.upgradeNotification.runUpgrade",
                    choice: selection ?? "",
                });

                if (selection === actionButtonText) {
                    commands.executeCommand(Commands.JAVA_UPGRADE_WITH_COPILOT, buildFixPrompt(issue), source);
                } else if (selection === BUTTON_TEXT_NOT_NOW) {
                    this.setNextShowTs(getNowTs() + SECONDS_COUNT_BEFORE_NOTIFICATION_RESHOW);
                }
            }
        ))();
    }

    private shouldShow() {
        return Settings.getEnableDependencyCheckup()
            && ((this.getNextShowTs() ?? 0) <= getNowTs());
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