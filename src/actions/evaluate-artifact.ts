"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeEvaluationMetrics, PASS_THRESHOLD } from "@/lib/evaluation/metrics";
import { detectRegressions } from "@/lib/evaluation/regression";
import type { EvaluationMetrics } from "@/lib/evaluation/metrics";
import type { RegressionReport } from "@/lib/evaluation/regression";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EvaluateArtifactResult {
  evaluationRunId: string;
  status: "PASSED" | "FAILED";
  metrics: EvaluationMetrics;
  regressionDetected: boolean;
  regressionReport: RegressionReport | null;
}

// ── Action ────────────────────────────────────────────────────────────────────

/**
 * Evaluate a PublicArtifact by computing quality metrics from its filesData
 * and optionally detecting regressions against a baseline artifact's metrics.
 *
 * Status rules:
 *   - PASSED if metrics.overallScore >= PASS_THRESHOLD (0.4) AND no regressions
 *   - FAILED otherwise
 *
 * Governance events:
 *   - EVALUATION_RUN_COMPLETED (always)
 *   - REGRESSION_DETECTED (only when regressionDetected = true)
 */
export async function evaluateArtifact({
  artifactId,
  baselineArtifactId,
}: {
  artifactId: string;
  baselineArtifactId?: string;
}): Promise<EvaluateArtifactResult> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const artifact = await prisma.publicArtifact.findUnique({
    where: { id: artifactId },
    select: { id: true, projectId: true, filesData: true, parentArtifactId: true },
  });
  if (!artifact) throw new Error("Artifact not found");

  // 1. Compute metrics from filesData
  const metrics = computeEvaluationMetrics(artifact.filesData);

  // 2. Regression detection — use explicit baselineArtifactId, fallback to parent
  const resolvedBaselineId = baselineArtifactId ?? artifact.parentArtifactId ?? null;
  let regressionReport: RegressionReport | null = null;

  if (resolvedBaselineId) {
    const baselineRun = await prisma.evaluationRun.findFirst({
      where: { artifactId: resolvedBaselineId, status: "PASSED" },
      orderBy: { createdAt: "desc" },
    });

    if (baselineRun) {
      const baselineMetrics = baselineRun.metrics as unknown as EvaluationMetrics;
      regressionReport = detectRegressions(baselineMetrics, metrics);
    }
  }

  const regressionDetected = regressionReport?.regressionDetected ?? false;

  // 3. Determine status
  const status: "PASSED" | "FAILED" =
    metrics.overallScore >= PASS_THRESHOLD && !regressionDetected ? "PASSED" : "FAILED";

  // 4. Persist EvaluationRun
  const evaluationRun = await prisma.evaluationRun.create({
    data: {
      artifactId,
      status,
      metrics: metrics as never,
      regressionDetected,
      baselineArtifactId: resolvedBaselineId,
    },
  });

  // 5. Governance: EVALUATION_RUN_COMPLETED
  await prisma.governanceEvent.create({
    data: {
      projectId: artifact.projectId,
      type: "EVALUATION_RUN_COMPLETED",
      actor: "system",
      details: {
        evaluationRunId: evaluationRun.id,
        artifactId,
        status,
        overallScore: metrics.overallScore,
        accessibilityScore: metrics.accessibilityScore,
        componentCoverage: metrics.componentCoverage,
        styleConsistency: metrics.styleConsistency,
        regressionDetected,
        baselineArtifactId: resolvedBaselineId,
      },
    },
  });

  // 6. Governance: REGRESSION_DETECTED (only when applicable)
  if (regressionDetected && regressionReport) {
    await prisma.governanceEvent.create({
      data: {
        projectId: artifact.projectId,
        type: "REGRESSION_DETECTED",
        actor: "system",
        details: {
          evaluationRunId: evaluationRun.id,
          artifactId,
          baselineArtifactId: resolvedBaselineId,
          regressions: regressionReport.regressions as never,
        },
      },
    });
  }

  return {
    evaluationRunId: evaluationRun.id,
    status,
    metrics,
    regressionDetected,
    regressionReport,
  };
}
