// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Upgrade } from "../constants";
import { UpgradeReason, type DependencyCheckMetadata } from "./type";

const MATURE_JAVA_LTS_VESRION = 21;

export const DEPENDENCY_JAVA_RUNTIME = {
    "name": "Java Runtime",
    "reason": UpgradeReason.JRE_TOO_OLD,
    "supportedVersion": `>=${MATURE_JAVA_LTS_VESRION}`,
    "suggestedVersion": {
        "name": `Java ${MATURE_JAVA_LTS_VESRION}`,
        "description": "LTS version",
    },
} as const;

const DEPENDENCIES_TO_SCAN: DependencyCheckMetadata = {
    "org.springframework.boot:*": {
        "reason": UpgradeReason.END_OF_LIFE,
        "name": "Spring Boot",
        "supportedVersion": "2.7.x || >=3.2.x",
        "eolDate": {
            "4.0.x": "2027-12",
            "3.5.x": "2032-06",
            "3.4.x": "2026-12",
            "3.3.x": "2026-06",
            "3.2.x": "2025-12",
            "3.1.x": "2025-06",
            "3.0.x": "2024-12",
            "2.7.x": "2029-06",
            "2.6.x": "2024-02",
            "2.5.x": "2023-08",
            "2.4.x": "2023-02",
            "2.3.x": "2022-08",
            "2.2.x": "2022-01",
            "2.1.x": "2021-01",
            "2.0.x": "2020-06",
            "1.5.x": "2020-11",
        },
        "suggestedVersion": {
            "name": "3.5",
            "description": "latest stable release",
        },
    },
    "org.springframework:*": {
        "reason": UpgradeReason.END_OF_LIFE,
        "name": "Spring Framework",
        "supportedVersion": "5.3.x || >=6.2.x",
        "eolDate": {
            "7.0.x": "2028-06",
            "6.2.x": "2032-06",
            "6.1.x": "2026-06",
            "6.0.x": "2025-08",
            "5.3.x": "2029-06",
            "5.2.x": "2023-12",
            "5.1.x": "2022-12",
            "5.0.x": "2022-12",
            "4.3.x": "2020-12",
        },
        "suggestedVersion": {
            "name": "3.5",
            "description": "latest stable release",
        },
    },
    "org.springframework.security:*": {
        "reason": UpgradeReason.END_OF_LIFE,
        "name": "Spring Security",
        "supportedVersion": "5.7.x || 5.8.x || >=6.2.x",
        "eolDate": {
            "7.0.x": "2027-12",
            "6.5.x": "2032-06",
            "6.4.x": "2026-12",
            "6.3.x": "2026-06",
            "6.2.x": "2025-12",
            "6.1.x": "2025-06",
            "6.0.x": "2024-12",
            "5.8.x": "2029-06",
            "5.7.x": "2029-06",
            "5.6.x": "2024-02",
            "5.5.x": "2023-08",
            "5.4.x": "2023-02",
            "5.3.x": "2022-08",
            "5.2.x": "2022-01",
            "5.1.x": "2021-01",
            "5.0.x": "2020-06",
            "4.2.x": "2020-11",
        },
        "suggestedVersion": {
            "name": "3.5",
            "description": "latest stable release",
        },
    },
    "javax:*": {
        "reason": UpgradeReason.DEPRECATED,
        "name": "Java EE",
        "suggestedVersion": {
            "name": "Jakarta EE 10",
            "description": "latest release with wide Java runtime version support",

        },
    },
    [Upgrade.PACKAGE_ID_FOR_JAVA_RUNTIME]: DEPENDENCY_JAVA_RUNTIME,
};

export default DEPENDENCIES_TO_SCAN;