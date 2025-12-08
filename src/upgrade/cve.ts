import { UpgradeIssue, UpgradeReason } from "./type";
import { Octokit } from "@octokit/rest";
import * as semver from "semver";

/**
 * Severity levels ordered by criticality (higher number = more critical)
 * The official doc about the severity levels can be found at:
 * https://docs.github.com/en/rest/security-advisories/global-advisories?apiVersion=2022-11-28
 */
export enum Severity {
  unknown = 0,
  low = 1,
  medium = 2,
  high = 3,
  critical = 4,
}

export interface CVE {
  id: string;
  ghsa_id: string;
  severity: keyof typeof Severity;
  summary: string;
  description: string;
  html_url: string;
  affectedDeps: {
    name?: string | null;
    vulVersions?: string | null;
    patchedVersion?: string | null;
  }[];
}

export type CveUpgradeIssue = UpgradeIssue & {
  reason: UpgradeReason.CVE;
  severity: string;
  link: string;
};

export async function batchGetCVEIssues(
  coordinates: string[]
): Promise<CveUpgradeIssue[]> {
  // Split dependencies into smaller batches to avoid URL length limit
  const BATCH_SIZE = 30;
  const allCVEUpgradeIssues: CveUpgradeIssue[] = [];

  // Process dependencies in batches
  for (let i = 0; i < coordinates.length; i += BATCH_SIZE) {
    const batchCoordinates = coordinates.slice(i, i + BATCH_SIZE);
    const cveUpgradeIssues = await getCveUpgradeIssues(batchCoordinates);
    allCVEUpgradeIssues.push(...cveUpgradeIssues);
  }

  return allCVEUpgradeIssues;
}

async function getCveUpgradeIssues(
  coordinates: string[]
): Promise<CveUpgradeIssue[]> {
  if (coordinates.length === 0) {
    return [];
  }
  const deps = coordinates
    .map((d) => d.split(":", 3))
    .map((p) => ({ name: `${p[0]}:${p[1]}`, version: p[2] }))
    .filter((d) => d.version);

  const depsCves = await fetchCves(deps);
  return mapCvesToUpgradeIssues(depsCves);
}

async function fetchCves(deps: { name: string; version: string }[]) {
  if (deps.length === 0) {
    return [];
  }
  try {
    const allCves: CVE[] = await retrieveVulnerabilityData(deps);

    if (allCves.length === 0) {
      return [];
    }
    // group the cves by coordinate
    const depsCves: { dep: string; version: string; cves: CVE[] }[] = [];

    for (const dep of deps) {
      const depCves: CVE[] = allCves.filter((cve) =>
        isCveAffectingDep(cve, dep.name, dep.version)
      );

      if (depCves.length < 1) {
        continue;
      }

      depsCves.push({
        dep: dep.name,
        version: dep.version,
        cves: depCves,
      });
    }

    return depsCves;
  } catch (error) {
    return [];
  }
}

async function retrieveVulnerabilityData(
  deps: { name: string; version: string }[]
) {
  if (deps.length === 0) {
    return [];
  }
  const octokit = new Octokit();

  const response = await octokit.securityAdvisories.listGlobalAdvisories({
    ecosystem: "maven",
    affects: deps.map((p) => `${p.name}@${p.version}`),
    direction: "asc",
    sort: "published",
    per_page: 100,
  });

  const allCves: CVE[] = response.data
    .filter(
      (c) =>
        !c.withdrawn_at?.trim() &&
        (c.severity === "critical" || c.severity === "high")
    ) // only consider critical and high severity CVEs
    .map((cve) => ({
      id: cve.cve_id || cve.ghsa_id,
      ghsa_id: cve.ghsa_id,
      severity: cve.severity,
      summary: cve.summary,
      description: cve.description || cve.summary,
      html_url: cve.html_url,
      affectedDeps: (cve.vulnerabilities ?? []).map((v) => ({
        name: v.package?.name,
        vulVersions: v.vulnerable_version_range,
        patchedVersion: v.first_patched_version,
      })),
    }));
  return allCves;
}

function mapCvesToUpgradeIssues(
  depsCves: { dep: string; version: string; cves: CVE[] }[]
) {
  if (depsCves.length === 0) {
    return [];
  }
  const upgradeIssues = depsCves.map((depCve) => {
    const mostCriticalCve = [...depCve.cves]
      .filter((cve) => isCveAffectingDep(cve, depCve.dep, depCve.version))
      .sort((a, b) => Severity[b.severity] - Severity[a.severity])[0];
    return {
      packageId: depCve.dep,
      packageDisplayName: depCve.dep,
      currentVersion: depCve.version || "unknown",
      name: `${mostCriticalCve.id || "CVE"}`,
      reason: UpgradeReason.CVE as const,
      suggestedVersion: {
        name: "",
        description: "",
      },
      severity: mostCriticalCve.severity,
      description:
        mostCriticalCve.description ||
        mostCriticalCve.summary ||
        "Security vulnerability detected",
      link: mostCriticalCve.html_url,
    };
  });
  return upgradeIssues;
}

function isCveAffectingDep(
  cve: CVE,
  depName: string,
  depVersion: string
): boolean {
  if (!cve.affectedDeps || cve.affectedDeps.length === 0) {
    return false;
  }
  return cve.affectedDeps.some((d) => {
    if (d.name !== depName) {
      return false;
    }
    if (!d.vulVersions || !d.patchedVersion) {
      return false;
    }
    return semver.satisfies(depVersion || "0.0.0", d.vulVersions);
  });
}
