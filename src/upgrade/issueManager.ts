// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import notificationManager from "./display/notificationManager";
import type { FileIssues, UpgradeIssue } from "./type";
import { normalizePath } from "./utility";

class IssueManager {
    private issuesList: Record</* filePath */ string, FileIssues> = {};


    public addIssue(pomPath: string, issue: UpgradeIssue) {
        const { packageId } = issue;
        const normalizedPath = normalizePath(pomPath);
        if (!this.issuesList[normalizedPath]) {
            this.issuesList[normalizedPath] = {};
        }
        this.issuesList[normalizedPath][packageId] = issue;
        this.refreshDisplay(this.issuesList[normalizedPath]);
    }

    public removeIssue(pomPath: string, packageId: string) {
        const normalizedPath = normalizePath(pomPath);
        if (!this.issuesList[normalizedPath] || !this.issuesList[normalizedPath][packageId]) {
            return;
        }
        delete this.issuesList[normalizedPath][packageId];
        this.refreshDisplay(this.issuesList[normalizedPath]);
    }

    public getIssues(filePath: string): FileIssues {
        const normalizedPath = normalizePath(filePath);
        return this.issuesList[normalizedPath] ?? {};
    }

    private refreshDisplay(issues: FileIssues) {
        notificationManager.refresh(issues);
    }
}

const issueManager = new IssueManager();
export default issueManager;