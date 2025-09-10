export type DependencyCheckItem = { name: string, supportedVersion: string };
export type DependencyCheckMetadata = Record<string, DependencyCheckItem>;
export type DependencyCheckResult = DependencyCheckItem & { packageRuleUsed: string };