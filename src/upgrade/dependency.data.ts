// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Upgrade } from "../constants";
import { UpgradeReason, type DependencyCheckMetadata } from "./type";

export const DEPENDENCY_JAVA_RUNTIME = {
    "name": "Java Runtime",
    "reason": UpgradeReason.JRE_TOO_OLD,
    "supportedVersion": `>=${Upgrade.LATEST_JAVA_LTS_VESRION}`,
} as const;

const DEPENDENCIES_TO_SCAN: DependencyCheckMetadata = {
    "org.springframework.boot:*": {
        "reason": UpgradeReason.END_OF_LIFE,
        "name": "Spring Boot",
        "supportedVersion": "2.7.x || >=3.2.x",
    },
    "org.springframework:*": {
        "reason": UpgradeReason.END_OF_LIFE,
        "name": "Spring Framework",
        "supportedVersion": "5.3.x || >=6.2.x",
    },
    "javax:javaee-api": {
        "reason": UpgradeReason.DEPRECATED,
        "name": "Java EE",
        "alternative": "Jakarta EE 10",
    },
    "javax:javaee-web-api": {
        "reason": UpgradeReason.DEPRECATED,
        "name": "Java EE",
        "alternative": "Jakarta EE 10",
    },
    [Upgrade.PACKAGE_ID_FOR_JAVA_RUNTIME]: DEPENDENCY_JAVA_RUNTIME,
};

export default DEPENDENCIES_TO_SCAN;