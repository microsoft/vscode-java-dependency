/**
 * Telemetry operation names for the upgrade flow.
 */
export const UpgradeTelemetry = {
    NOTIFICATION_SHOW: "java.dependency.upgradeNotification.show",
    NOTIFICATION_CLICK: "java.dependency.upgradeNotification.runUpgrade",
    EXECUTE_START: "java.dependency.upgrade.execute.start",
    EXECUTE_END: "java.dependency.upgrade.execute.end",
    EXTENSION_INSTALL_START: "java.dependency.upgrade.extensionInstall.start",
    EXTENSION_INSTALL_END: "java.dependency.upgrade.extensionInstall.end",
    RELOAD_PROMPT_SHOW: "java.dependency.upgrade.reloadPrompt.show",
    RELOAD_PROMPT_CLICK: "java.dependency.upgrade.reloadPrompt.click",
} as const;
