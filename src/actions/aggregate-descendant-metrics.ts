"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getArtifactDescendants } from "./get-artifact-descendants";
import type { EvaluationMetrics } from "@/lib/evaluation/metrics";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DescendantAggregateMetrics {
  descendantCount: number;
  evaluatedCount: number;
  /** Fraction of evaluated descendants that PASSED: 0–1. */
  successRate: number;
  avgOverallScore: number;
  avgAccessibilityScore: number;
  avgComponentCoverage: number;
  avgStyleConsistency: number;
  /** Metric names that appeared as regressions most frequently across descendants. */
  commonRegressions: string[];
  computedAt: string;
}

export interface AggregateDescendantMetricsResult {
  artifactId: string;
  descendantCount: number;
  metrics: DescendantAggregateMetrics;
}

// ── Action ────────────────────────────────────────────────────────────────────

/**
 * Aggregate evaluation outcomes across all descendants of an artifact.
 *
 * Steps:
 *   1. BFS-walk all descendants (up to depth 5)
 *   2. Fetch the latest EvaluationRun per descendant
 *   3. Compute aggregate stats (success rate, score averages, common regressions)
 *   4. Persist `descendantCount` + `descendantMetrics` on the root PublicArtifact
 *   5. Log `DESCENDANT_METRICS_AGGREGATED` governance event
 */
export async function aggregateDescendantMetrics({
  artifactId,
}: {
  artifactId: string;
}): Promise<AggregateDescendantMetricsResult> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const artifact = await prisma.publicArtifact.findUnique({
    where: { id: artifactId },
    select: { id: true, projectId: true },
  });
  if (!artifact) throw new Error("Artifact not found");

  // 1. Collect all descendants
  const { descendants } = await getArtifactDescendants(artifactId);
  const descendantCount = descendants.length;

  if (descendantCount === 0) {
    const empty: DescendantAggregateMetrics = {
      descendantCount: 0,
      evaluatedCount: 0,
      successRate: 0,
      avgOverallScore: 0,
      avgAccessibilityScore: 0,
      avgComponentCoverage: 0,
      avgStyleConsistency: 0,
      commonRegressions: [],
      computedAt: new Date().toISOString(),
    };

    await prisma.publicArtifact.update({
      where: { id: artifactId },
      data: { descendantCount: 0, descendantMetrics: empty as never },
    });

    return { artifactId, descendantCount: 0, metrics: empty };
  }

  // 2. Fetch latest EvaluationRun per descendant
  const descendantIds = descendants.map((d) => d.id);

  // One query per descendant to get the latest run — batched but sequential-safe
  const evalRuns = await Promise.all(
    descendantIds.map((id) =>
      prisma.evaluationRun.findFirst({
        where: { artifactId: id },
        orderBy: { createdAt: "desc" },
        select: { artifactId: true, status: true, metrics: true, regressionDetected: true },
      })
    )
  );

  const runsWithData = evalRuns.filter(Boolean) as NonNullable<(typeof evalRuns)[number]>[];
  const evaluatedCount = runsWithData.length;
  const passedRuns = runsWithData.filter((r) => r.status === "PASSED");
  const successRate =
    evaluatedCount > 0 ? parseFloat((passedRuns.length / evaluatedCount).toFixed(4)) : 0;

  // 3. Compute score averages (from PASSED runs only — failed runs skew low)
  const scoredRuns = passedRuns.length > 0 ? passedRuns : runsWithData;
  const avgOf = (field: keyof EvaluationMetrics): number => {
    if (scoredRuns.length === 0) return 0;
    const sum = scoredRuns.reduce((acc, r) => {
      const m = r.metrics as unknown as EvaluationMetrics;
      return acc + (m[field] as number ?? 0);
    }, 0);
    return parseFloat((sum / scoredRuns.length).toFixed(4));
  };

  // 4. Common regressions — count how often each metric was flagged
  const regressionCounts: Record<string, number> = {};
  for (const run of runsWithData) {
    if (!run.regressionDetected) continue;
    // EvaluationRun.metrics doesn't store regression details — we use EvaluationRun status
    // Approximate: count runs that FAILED due to each score being below threshold
    const m = run.metrics as unknown as EvaluationMetrics;
    if (m.accessibilityScore < 0.4) regressionCounts["accessibilityScore"] = (regressionCounts["accessibilityScore"] ?? 0) + 1;
    if (m.componentCoverage < 0.3) regressionCounts["componentCoverage"] = (regressionCounts["componentCoverage"] ?? 0) + 1;
    if (m.styleConsistency < 0.3) regressionCounts["styleConsistency"] = (regressionCounts["styleConsistency"] ?? 0) + 1;
  }
  const commonRegressions = Object.entries(regressionCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([k]) => k);

  const metrics: DescendantAggregateMetrics = {
    descendantCount,
    evaluatedCount,
    successRate,
    avgOverallScore: avgOf("overallScore"),
    avgAccessibilityScore: avgOf("accessibilityScore"),
    avgComponentCoverage: avgOf("componentCoverage"),
    avgStyleConsistency: avgOf("styleConsistency"),
    commonRegressions,
    computedAt: new Date().toISOString(),
  };

  // 5. Persist on root artifact
  await prisma.publicArtifact.update({
    where: { id: artifactId },
    data: { descendantCount, descendantMetrics: metrics as never },
  });

  // 6. Governance event
  await prisma.governanceEvent.create({
    data: {
      projectId: artifact.projectId,
      type: "DESCENDANT_METRICS_AGGREGATED",
      actor: "system",
      details: {
        artifactId,
        descendantCount,
        evaluatedCount,
        successRate,
        avgOverallScore: metrics.avgOverallScore,
        commonRegressions,
      },
    },
  });

  return { artifactId, descendantCount, metrics };
}
