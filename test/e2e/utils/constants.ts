// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

/**
 * Centralized constants for VS Code E2E tests.
 * Keep ARIA role strings, timeouts, and selector patterns here
 * so that tests and operators stay tidy.
 */

// ---------------------------------------------------------------------------
//  Timeouts (milliseconds)
// ---------------------------------------------------------------------------

export const Timeout = {
    /** Short pause after a click or keystroke */
    CLICK: 1_000,
    /** Longer pause after expanding a tree item (DOM needs time to render children) */
    TREE_EXPAND: 3_000,
    /** Wait before the first assertion in a test (let VS Code settle) */
    PREPARE: 5_000,
    /** Wait for a heavy extension to activate */
    EXTENSION_ACTIVATE: 10_000,
    /** Maximum wait for Java Language Server to report "Ready" */
    JAVA_LS_READY: 180_000,
    /** Interval between polls when waiting for LS readiness */
    JAVA_LS_POLL_INTERVAL: 2_000,
} as const;

// ---------------------------------------------------------------------------
//  VS Code ARIA roles & selectors
// ---------------------------------------------------------------------------

export const VSCode = {
    // Command palette
    CMD_PALETTE_KEY: "F1",
    CMD_PALETTE_ROLE: "combobox" as const,
    CMD_PALETTE_INPUT_NAME: "INPUT",
    OPTION_ROLE: "option" as const,
    LISTBOX_ROLE: "listbox" as const,
    // Side bar / activity bar
    TAB_ROLE: "tab" as const,
    // Tree view
    TREE_ITEM_ROLE: "treeitem" as const,
    // Buttons & toolbars
    BUTTON_ROLE: "button" as const,
    TOOLBAR_ROLE: "toolbar" as const,
    // Keys
    ENTER: "Enter",
    ESCAPE: "Escape",
    // Elements
    LINK: "a",
} as const;

// ---------------------------------------------------------------------------
//  Java-specific
// ---------------------------------------------------------------------------

export const Java = {
    JAVA_PROJECTS_SECTION: "Java Projects",
    JAVA_LS_STATUS_LABEL: "Language Status",
} as const;
