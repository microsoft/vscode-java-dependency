export function buildPackageId(groupId: string, artifactId: string): string {
    return `${groupId}:${artifactId}`;
}