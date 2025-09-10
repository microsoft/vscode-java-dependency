// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import type { DependencyCheckMetadata, DependencyCheckItem } from "./type";
import { Upgrade } from "../constants";
import { buildPackageId } from "./utility";
import DEPENDENCIES_TO_SCAN from "./dependency.data";


class MetadataManager {
    private dependencyCheckMetadata: DependencyCheckMetadata = DEPENDENCIES_TO_SCAN;

    public getMetadataById(givenPackageId: string): DependencyCheckItem | undefined {
        const splits = givenPackageId.split(":", 2);
        const groupId = splits[0];
        const artifactId = splits[1] ?? "";

        if (groupId === Upgrade.DIAGNOSTICS_GROUP_ID_FOR_JAVA_ENGINE) {
            return {
                name: Upgrade.DIAGNOSTICS_NAME_FOR_JAVA_ENGINE,
                supportedVersion: `>=${Upgrade.LATEST_JAVA_LTS_VESRION}`,
            };
        }

        const packageId = buildPackageId(groupId, artifactId);
        const packageIdWithWildcardArtifactId = buildPackageId(groupId, "*");
        return this.getMetadata(packageId) ?? this.getMetadata(packageIdWithWildcardArtifactId);
    }

    private getMetadata(packageRuleUsed: string) {
        return this.dependencyCheckMetadata[packageRuleUsed] ? {
            ...this.dependencyCheckMetadata[packageRuleUsed], packageRuleUsed
        } : undefined;
    }
}

const metadataManager = new MetadataManager();
export default metadataManager; 