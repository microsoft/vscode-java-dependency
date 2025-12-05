// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, ExtensionContext, extensions, window } from "vscode";
import { UpgradeReason, type IUpgradeIssuesRenderer, type UpgradeIssue } from "../type";
import { buildCVENotificationMessage, buildFixPrompt, buildNotificationMessage } from "../utility";
import { Commands } from "../../commands";
import { Settings } from "../../settings";
import { instrumentOperation, sendInfo } from "vscode-extension-telemetry-wrapper";
import { ExtensionName } from "../../constants";
import { CveUpgradeIssue } from "../cve";

const KEY_PREFIX = 'javaupgrade.notificationManager';
const NEXT_SHOW_TS_KEY = `${KEY_PREFIX}.nextShowTs`;

const BUTTON_TEXT_UPGRADE = "Upgrade Now";
const BUTTON_TEXT_FIX_CVE = "Fix CVE Issues";
const BUTTON_TEXT_INSTALL_AND_UPGRADE = "Install Extension and Upgrade";
const BUTTON_TEXT_INSTALL_AND_FIX_CVE = "Install Extension and Fix";
const BUTTON_TEXT_NOT_NOW = "Not Now";

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
                const issue = issues[0];

                if (!this.shouldShow()) {
                    return;
                }

                if (this.hasShown) {
                    return;
                }
                this.hasShown = true;

                const hasExtension = !!extensions.getExtension(ExtensionName.APP_MODERNIZATION_UPGRADE_FOR_JAVA);
                const prompt = buildFixPrompt(issue);

                let notificationMessage = "";
                let cveIssues: CveUpgradeIssue[] = [];
                if (issue.reason === UpgradeReason.CVE) {
                    // Filter to only CVE issues and cast to CveUpgradeIssue[]
                    cveIssues = issues.filter(
                        (i): i is CveUpgradeIssue => i.reason === UpgradeReason.CVE
                    );
                    notificationMessage = buildCVENotificationMessage(cveIssues, hasExtension);
                } else {
                    notificationMessage = buildNotificationMessage(issue, hasExtension);
                }
                const upgradeButtonText = hasExtension ? BUTTON_TEXT_UPGRADE : BUTTON_TEXT_INSTALL_AND_UPGRADE;
                const fixCVEButtonText = hasExtension ? BUTTON_TEXT_FIX_CVE : BUTTON_TEXT_INSTALL_AND_FIX_CVE;
                sendInfo(operationId, {
                    operationName: "java.dependency.upgradeNotification.show",
                });

                const buttons = issue.reason === UpgradeReason.CVE
                    ? [fixCVEButtonText, BUTTON_TEXT_NOT_NOW]
                    : [upgradeButtonText, BUTTON_TEXT_NOT_NOW];

                const selection = await window.showInformationMessage(
                        notificationMessage,
                        ...buttons
                    );
                sendInfo(operationId, {
                    operationName: "java.dependency.upgradeNotification.runUpgrade",
                    choice: selection ?? "",
                });

                switch (selection) {
                    case fixCVEButtonText:
                    case upgradeButtonText: {
                        commands.executeCommand(Commands.JAVA_UPGRADE_WITH_COPILOT, prompt);
                        break;
                    }
                    case BUTTON_TEXT_NOT_NOW: {
                        this.setNextShowTs(getNowTs() + SECONDS_COUNT_BEFORE_NOTIFICATION_RESHOW);
                        break;
                    }
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