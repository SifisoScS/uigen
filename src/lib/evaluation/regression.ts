/**
 * Regression detection: compare a new artifact's metrics against a baseline
 * (typically the parent artifact's most recent PASSED EvaluationRun).
 */

import type { EvaluationMetrics } from "./metrics";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RegressionReport {
  regressionDetected: boolean;
  regressions: RegressionDetail[];
}

export interface RegressionDetail {
  metric: string;
  baseline: number;
  current: number;
  drop: number;
  threshold: number;
}

// ── Thresholds ────────────────────────────────────────────────────────────────

/** Drop in accessibilityScore that constitutes a regression. */
const A11Y_REGRESSION_THRESHOLD = 0.15;
/** Drop in componentCoverage that constitutes a regression. */
const COVERAGE_REGRESSION_THRESHOLD = 0.2;
/** Drop in styleConsistency that constitutes a regression. */
const STYLE_REGRESSION_THRESHOLD = 0.2;
/** Drop in overallScore that constitutes a regression. */
const OVERALL_REGRESSION_THRESHOLD = 0.15;

// ── Detection ─────────────────────────────────────────────────────────────────

/**
 * Compare `current` metrics against `baseline` metrics.
 * Returns a report of which metrics regressed and by how much.
 */
export function detectRegressions(
  baseline: EvaluationMetrics,
  current: EvaluationMetrics
): RegressionReport {
  const checks: Array<{
    metric: keyof EvaluationMetrics;
    threshold: number;
  }> = [
    { metric: "accessibilityScore", threshold: A11Y_REGRESSION_THRESHOLD },
    { metric: "componentCoverage", threshold: COVERAGE_REGRESSION_THRESHOLD },
    { metric: "styleConsistency", threshold: STYLE_REGRESSION_THRESHOLD },
    { metric: "overallScore", threshold: OVERALL_REGRESSION_THRESHOLD },
  ];

  const regressions: RegressionDetail[] = [];

  for (const { metric, threshold } of checks) {
    const baselineVal = baseline[metric] as number;
    const currentVal = current[metric] as number;
    const drop = baselineVal - currentVal;
    if (drop > threshold) {
      regressions.push({
        metric,
        baseline: baselineVal,
        current: currentVal,
        drop: parseFloat(drop.toFixed(4)),
        threshold,
      });
    }
  }

  return {
    regressionDetected: regressions.length > 0,
    regressions,
  };
}
