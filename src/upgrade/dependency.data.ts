// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import type { DependencyCheckMetadata } from "./type";

const DEPENDENCIES_TO_SCAN: DependencyCheckMetadata = {
    "org.springframework.boot:*": {
        "name": "Spring Boot",
        "supportedVersion": "2.7.x || >=3.2.x",
    },
    "org.springframework:*": {
        "name": "Spring Framework",
        "supportedVersion": "5.3.x || >=6.2.x",
    }
};

export default DEPENDENCIES_TO_SCAN;