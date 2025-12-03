import { UpgradeIssue, UpgradeReason } from "./type";
import { Octokit } from "@octokit/rest";
import * as semver from 'semver';

/**
 * Severity levels ordered by criticality (higher number = more critical)
 * The official doc about the severity levels can be found at:
 * https://docs.github.com/en/rest/security-advisories/global-advisories?apiVersion=2022-11-28
 */
export const severityOrder = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
    unknown: 0,
} as const;

export type Severity = keyof typeof severityOrder;

export interface CVE {
    id: string;
    ghsa_id: string;
    severity: Severity;
    summary: string;
    description: string;
    html_url: string;
    affectedDeps: {
        name?: string | null;
        vulVersions?: string | null;
        patchedVersion?: string | null;
    }[];
}

export type CveUpgradeIssue = UpgradeIssue & { reason: UpgradeReason.CVE; severity: string; link: string };

export async function batchGetCVEs(
  coordinates: string[]
): Promise<CveUpgradeIssue[]> {

  // Split dependencies into smaller batches to avoid URL length limit
  const BATCH_SIZE = 30;
  const allCVEDeps: CveUpgradeIssue[] = [];

  // Process dependencies in batches
  for (let i = 0; i < coordinates.length; i += BATCH_SIZE) {
    const batchCoordinates = coordinates.slice(i, i + BATCH_SIZE);
    const batchCVEDeps = await getCVEs(batchCoordinates);
    allCVEDeps.push(...batchCVEDeps);
  }

  return allCVEDeps;
}

async function getCVEs(
    coordinates: string[]
): Promise<CveUpgradeIssue[]> {
    try {
        const octokit = new Octokit();

        const deps = coordinates
            .map((d) => d.split(':', 3))
            .map((p) => ({ name: `${p[0]}:${p[1]}`, version: p[2] }))
            .filter((d) => d.version);
        const response = await octokit.securityAdvisories.listGlobalAdvisories({
            ecosystem: 'maven',
            affects: deps.map((p) => `${p.name}@${p.version}`),
            direction: 'asc',
            sort: 'published',
            per_page: 100
        });

        const allCves: CVE[] = response.data
            .filter((c) => !c.withdrawn_at?.trim() &&
                (c.severity === 'critical' || c.severity === 'high')) // only consider critical and high severity CVEs
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
                    patchedVersion: v.first_patched_version
                }))
            }));

        // group the cves by coordinate
        const depsCves: { dep: string; cves: CVE[]; minVersion?: string | null }[] = [];
        for (const dep of deps) {
            const depCves: CVE[] = allCves.filter((cve) => cve.affectedDeps.some((d) => d.name === dep.name));
            if (depCves.length < 1) {
                continue;
            }
            // find the min patched version for each coordinate
            let maxPatchedVersion: string | undefined | null;
            for (const cve of depCves) {
                const patchedVersion = cve.affectedDeps.find((d) => d.name === dep.name && d.patchedVersion)?.patchedVersion;
                const coercedPatchedVersion = semver.coerce(patchedVersion);
                const coercedMaxPatchedVersion = semver.coerce(maxPatchedVersion);
                if (
                    !maxPatchedVersion ||
                    (coercedPatchedVersion &&
                        coercedMaxPatchedVersion &&
                        semver.gt(coercedPatchedVersion, coercedMaxPatchedVersion))
                ) {
                    maxPatchedVersion = patchedVersion;
                }
            }

            depsCves.push({
                dep: dep.name,
                cves: depCves,
                minVersion: maxPatchedVersion
            });
        }

        const upgradeIssues =  depsCves.map(depCve => {
            const currentDep = deps.find(d => d.name === depCve.dep);
            const mostCriticalCve = findMostCriticalCve(depCve.cves);
            return {
                packageId: depCve.dep,
                packageDisplayName: depCve.dep,
                currentVersion: currentDep?.version || 'unknown',
                name: `${mostCriticalCve.id || 'CVE'}`,
                reason: UpgradeReason.CVE as const,
                suggestedVersion: {
                    name: depCve.minVersion || 'unknown',
                    description: mostCriticalCve.description || mostCriticalCve.summary || 'Security vulnerability detected'
                },
                severity: mostCriticalCve.severity,
                description: mostCriticalCve.description || mostCriticalCve.summary || 'Security vulnerability detected',
                link: mostCriticalCve.html_url,
            };
        });
        return upgradeIssues;
    } catch (error) {
        throw error;
    }
}

function findMostCriticalCve(depCves: CVE[]) {
    let mostCriticalSeverity: Severity = 'unknown';
    let mostCriticalCve = depCves[0];

    for (const cve of depCves) {
        if (severityOrder[cve.severity] > severityOrder[mostCriticalSeverity]) {
            mostCriticalSeverity = cve.severity;
            mostCriticalCve = cve;
        }
    }
    return mostCriticalCve;
}
