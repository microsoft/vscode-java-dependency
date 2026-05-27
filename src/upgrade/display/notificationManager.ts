// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, ExtensionContext, extensions, window } from "vscode";
import * as semver from "semver";
import { UpgradeReason, type IUpgradeIssuesRenderer, type UpgradeIssue } from "../type";
import { buildCVENotificationMessage, buildFixPrompt, buildNotificationMessage, type ExtensionState } from "../utility";
import { Commands } from "../../commands";
import { Settings } from "../../settings";
import { instrumentOperation, sendInfo } from "vscode-extension-telemetry-wrapper";
import { ExtensionName, Upgrade } from "../../constants";
import { CveUpgradeIssue } from "../cve";
import { UpgradeTelemetry } from "../telemetryConstants";

const KEY_PREFIX = 'javaupgrade.notificationManager';
const NEXT_SHOW_TS_KEY = `${KEY_PREFIX}.nextShowTs`;

const BUTTON_TEXT_UPGRADE = "Upgrade Now";
const BUTTON_TEXT_FIX_CVE = "Fix Now";
const BUTTON_TEXT_INSTALL_AND_UPGRADE = "Install Extension and Upgrade";
const BUTTON_TEXT_INSTALL_AND_FIX_CVE = "Install Extension and Fix";
const BUTTON_TEXT_UPDATE_AND_UPGRADE = "Update Extension and Upgrade";
const BUTTON_TEXT_UPDATE_AND_FIX_CVE = "Update Extension and Fix";
const BUTTON_TEXT_NOT_NOW = "Not Now";

const SECONDS_IN_A_DAY = 24 * 60 * 60;
const SECONDS_COUNT_BEFORE_NOTIFICATION_RESHOW = 10 * SECONDS_IN_A_DAY;

function getNowTs() {
    return Number(new Date()) / 1000;
}

export type { ExtensionState } from "../utility";

export interface NotificationContent {
    message: string;
    upgradeButtonText: string;
    fixCVEButtonText: string;
}

export function getExtensionState(extensionVersion: string | undefined): ExtensionState {
    if (!extensionVersion) {
        return "not-installed";
    }
    if (semver.gte(extensionVersion, Upgrade.MIN_APPMOD_VERSION)) {
        return "up-to-date";
    }
    return "outdated";
}

export function buildNotificationContent(
    issues: UpgradeIssue[],
    extensionState: ExtensionState,
): NotificationContent {
    const cveIssues = issues.filter(
        (i): i is CveUpgradeIssue => i.reason === UpgradeReason.CVE
    );
    const nonCVEIssues = issues.filter(
        (i) => i.reason !== UpgradeReason.CVE
    );
    const hasCVEIssue = cveIssues.length > 0;

    const message = hasCVEIssue
        ? buildCVENotificationMessage(cveIssues, extensionState)
        : buildNotificationMessage(nonCVEIssues[0], extensionState);

    let upgradeButtonText: string;
    let fixCVEButtonText: string;

    switch (extensionState) {
        case "up-to-date":
            upgradeButtonText = BUTTON_TEXT_UPGRADE;
            fixCVEButtonText = BUTTON_TEXT_FIX_CVE;
            break;
        case "outdated":
            upgradeButtonText = BUTTON_TEXT_UPDATE_AND_UPGRADE;
            fixCVEButtonText = BUTTON_TEXT_UPDATE_AND_FIX_CVE;
            break;
        case "not-installed":
            upgradeButtonText = BUTTON_TEXT_INSTALL_AND_UPGRADE;
            fixCVEButtonText = BUTTON_TEXT_INSTALL_AND_FIX_CVE;
            break;
    }

    return { message, upgradeButtonText, fixCVEButtonText };
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

                if (!this.shouldShow()) {
                    return;
                }

                if (this.hasShown) {
                    return;
                }
                this.hasShown = true;

                const ext = extensions.getExtension(ExtensionName.APP_MODERNIZATION_UPGRADE_FOR_JAVA);
                const extensionState = getExtensionState(ext?.packageJSON?.version);
                const { message, upgradeButtonText, fixCVEButtonText } = buildNotificationContent(issues, extensionState);

                const hasCVEIssue = issues.some(i => i.reason === UpgradeReason.CVE);
                const issueType = hasCVEIssue ? "cve" : "upgrade";
                const issue = hasCVEIssue
                    ? issues.find((i): i is CveUpgradeIssue => i.reason === UpgradeReason.CVE)!
                    : issues.find(i => i.reason !== UpgradeReason.CVE)!;
                const prompt = buildFixPrompt(issue);

                sendInfo(operationId, {
                    operationName: UpgradeTelemetry.NOTIFICATION_SHOW,
                    extensionState,
                    issueType,
                });

                const buttons = hasCVEIssue
                    ? [fixCVEButtonText, BUTTON_TEXT_NOT_NOW]
                    : [upgradeButtonText, BUTTON_TEXT_NOT_NOW];

                const selection = await window.showInformationMessage(
                        message,
                        ...buttons
                    );
                sendInfo(operationId, {
                    operationName: UpgradeTelemetry.NOTIFICATION_CLICK,
                    extensionState,
                    issueType,
                    choice: selection ?? "",
                });

                switch (selection) {
                    case fixCVEButtonText:
                    case upgradeButtonText: {
                        commands.executeCommand(Commands.JAVA_UPGRADE_WITH_COPILOT, prompt, issueType, extensionState);
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