import * as assert from "assert";
import { getExtensionState, buildNotificationContent } from "../../src/upgrade/display/notificationManager";
import { UpgradeReason, type UpgradeIssue } from "../../src/upgrade/type";
import { Upgrade } from "../../src/constants";

suite("notificationManager pure functions", () => {

    suite("getExtensionState", () => {
        test("returns 'not-installed' when version is undefined", () => {
            assert.strictEqual(getExtensionState(undefined), "not-installed");
        });

        // Real release versions that are below MIN_APPMOD_VERSION (1.13.0)
        const outdatedVersions = [
            "1.14.1",
            "1.14.2026033101",
            "1.14.0",
            "1.13.0",
            "1.13.2026031003",
            "1.13.2026030905",
            "1.12.26021301",
            "1.11.0",
            "1.11.26012301",
            "1.10.1",
            "1.10.0",
            "1.9.1",
            "1.0.0",
            "0.5.2025061701",
        ];

        for (const version of outdatedVersions) {
            test(`returns 'outdated' for version ${version}`, () => {
                assert.strictEqual(getExtensionState(version), "outdated");
            });
        }

        // Real release versions that are >= MIN_APPMOD_VERSION (1.13.0)
        const upToDateVersions = [
            "1.15.0",               // exact minimum
            "1.15.3",
            "1.16.0",
            "1.17.0",
            "1.17.1",
            "1.18.0",
            "1.19.0",
            "1.19.1",
            "1.19.2",
            "1.20.26052601",        // latest
        ];

        for (const version of upToDateVersions) {
            test(`returns 'up-to-date' for version ${version}`, () => {
                assert.strictEqual(getExtensionState(version), "up-to-date");
            });
        }

        test("MIN_APPMOD_VERSION is 1.15.0", () => {
            assert.strictEqual(Upgrade.MIN_APPMOD_VERSION, "1.15.0");
        });
    });

    suite("buildNotificationContent", () => {
        const upgradeIssue: UpgradeIssue = {
            packageId: "org.springframework.boot:spring-boot-starter",
            packageDisplayName: "Spring Boot",
            currentVersion: "2.7.0",
            name: "spring-boot-starter",
            reason: UpgradeReason.DEPRECATED,
            suggestedVersion: { name: "3.2.0", description: "latest stable" },
        };

        const cveIssue: UpgradeIssue = {
            packageId: "org.apache.logging.log4j:log4j-core",
            packageDisplayName: "Log4j",
            currentVersion: "2.14.0",
            name: "log4j-core",
            reason: UpgradeReason.CVE,
            suggestedVersion: { name: "2.17.1", description: "patched" },
            severity: "critical",
            description: "Remote code execution",
            link: "https://nvd.nist.gov/vuln/detail/CVE-2021-44228",
        };

        suite("button text", () => {
            test("shows 'Upgrade Now' / 'Fix Now' when extension is up-to-date", () => {
                const result = buildNotificationContent([upgradeIssue], "up-to-date");
                assert.strictEqual(result.upgradeButtonText, "Upgrade Now");
                assert.strictEqual(result.fixCVEButtonText, "Fix Now");
            });

            test("shows 'Update Extension and Upgrade/Fix' when extension is outdated", () => {
                const result = buildNotificationContent([upgradeIssue], "outdated");
                assert.strictEqual(result.upgradeButtonText, "Update Extension and Upgrade");
                assert.strictEqual(result.fixCVEButtonText, "Update Extension and Fix");
            });

            test("shows 'Install Extension and Upgrade/Fix' when extension is not installed", () => {
                const result = buildNotificationContent([upgradeIssue], "not-installed");
                assert.strictEqual(result.upgradeButtonText, "Install Extension and Upgrade");
                assert.strictEqual(result.fixCVEButtonText, "Install Extension and Fix");
            });
        });

        suite("message body", () => {
            test("up-to-date: message says 'upgrade'", () => {
                const result = buildNotificationContent([upgradeIssue], "up-to-date");
                assert.ok(result.message.includes("upgrade"));
                assert.ok(!result.message.includes("install"));
                assert.ok(!result.message.includes("update"));
            });

            test("outdated: message says 'update ... extension and upgrade'", () => {
                const result = buildNotificationContent([upgradeIssue], "outdated");
                assert.ok(result.message.includes("update"));
                assert.ok(result.message.includes("extension and upgrade"));
            });

            test("not-installed: message says 'install ... extension and upgrade'", () => {
                const result = buildNotificationContent([upgradeIssue], "not-installed");
                assert.ok(result.message.includes("install"));
                assert.ok(result.message.includes("extension and upgrade"));
            });

            test("CVE up-to-date: message says 'fix'", () => {
                const result = buildNotificationContent([cveIssue], "up-to-date");
                assert.ok(result.message.includes("fix"));
                assert.ok(result.message.includes("CVE"));
            });

            test("CVE outdated: message says 'update ... extension and fix'", () => {
                const result = buildNotificationContent([cveIssue], "outdated");
                assert.ok(result.message.includes("update"));
                assert.ok(result.message.includes("extension and fix"));
            });

            test("CVE not-installed: message says 'install ... extension and fix'", () => {
                const result = buildNotificationContent([cveIssue], "not-installed");
                assert.ok(result.message.includes("install"));
                assert.ok(result.message.includes("extension and fix"));
            });
        });
    });
});
