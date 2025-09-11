// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { UpgradeReason, type DependencyCheckMetadata } from "./type";

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
    }
};

export default DEPENDENCIES_TO_SCAN;