// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { type DependencyCheckMetadata, type DependencyCheckItem } from "./type";
import { buildPackageId } from "./utility";
import DEPENDENCIES_TO_SCAN from "./dependency.metadata";

class MetadataManager {
    private static dependencyCheckMetadata: DependencyCheckMetadata = DEPENDENCIES_TO_SCAN;

    public static getMetadataById(givenPackageId: string): DependencyCheckItem | undefined {
        const splits = givenPackageId.split(":", 2);
        const groupId = splits[0];
        const artifactId = splits[1] ?? "";

        const packageId = buildPackageId(groupId, artifactId);
        const packageIdWithWildcardArtifactId = buildPackageId(groupId, "*");
        return this.getMetadata(packageId) ?? this.getMetadata(packageIdWithWildcardArtifactId);
    }

    private static getMetadata(packageRuleUsed: string) {
        return this.dependencyCheckMetadata[packageRuleUsed] ? {
            ...this.dependencyCheckMetadata[packageRuleUsed], packageRuleUsed
        } : undefined;
    }
}

export default MetadataManager;