// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Upgrade } from "../constants";
import { UpgradeReason, type DependencyCheckMetadata } from "./type";

const LATEST_JAVA_LTS_VESRION = 21;

export const DEPENDENCY_JAVA_RUNTIME = {
    "name": "Java Runtime",
    "reason": UpgradeReason.JRE_TOO_OLD,
    "supportedVersion": `>=${LATEST_JAVA_LTS_VESRION}`,
    "suggestedVersion": {
        "name": String(LATEST_JAVA_LTS_VESRION),
        "description": "latest LTS version",
    },
} as const;

const DEPENDENCIES_TO_SCAN: DependencyCheckMetadata = {
    "org.springframework.boot:*": {
        "reason": UpgradeReason.END_OF_LIFE,
        "name": "Spring Boot",
        "supportedVersion": "2.7.x || >=3.2.x",
        "suggestedVersion": {
            "name": "3.5",
            "description": "latest stable release",
        },
    },
    "org.springframework:*": {
        "reason": UpgradeReason.END_OF_LIFE,
        "name": "Spring Framework",
        "supportedVersion": "5.3.x || >=6.2.x",
        "suggestedVersion": {
            "name": "3.5",
            "description": "latest stable release",
        },
    },
    "org.springframework.security:*": {
        "reason": UpgradeReason.END_OF_LIFE,
        "name": "Spring Security",
        "supportedVersion": "5.7.x || 5.8.x || >=6.2.x",
        "suggestedVersion": {
            "name": "3.5",
            "description": "latest stable release",
        },
    },
    "javax:*": {
        "reason": UpgradeReason.DEPRECATED,
        "name": "Java EE",
        "alternative": {
            "name": "Jakarta EE 10",
            "description": "latest release with wide Java runtime version support",

        },
    },
    [Upgrade.PACKAGE_ID_FOR_JAVA_RUNTIME]: DEPENDENCY_JAVA_RUNTIME,
};

export default DEPENDENCIES_TO_SCAN;