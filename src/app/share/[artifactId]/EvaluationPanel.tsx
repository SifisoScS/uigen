"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  FlaskConical,
  AlertTriangle,
} from "lucide-react";
import { evaluateArtifact } from "@/actions/evaluate-artifact";
import type { EvaluationMetrics } from "@/lib/evaluation/metrics";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  artifactId: string;
  initialStatus: string | null;
  initialMetrics: EvaluationMetrics | null;
}

// ── Status badge ──────────────────────────────────────────────────────────────

function EvalStatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] text-neutral-500 text-xs font-medium">
        <Clock className="h-3 w-3" />
        Not evaluated
      </span>
    );
  }
  if (status === "PASSED") {
    return (
      <span
        data-testid="eval-status-badge"
        className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 text-xs font-medium"
      >
        <CheckCircle className="h-3 w-3" />
        PASSED
      </span>
    );
  }
  if (status === "FAILED") {
    return (
      <span
        data-testid="eval-status-badge"
        className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-950 border border-red-800 text-red-400 text-xs font-medium"
      >
        <XCircle className="h-3 w-3" />
        FAILED
      </span>
    );
  }
  return (
    <span
      data-testid="eval-status-badge"
      className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-950 border border-amber-800 text-amber-400 text-xs font-medium"
    >
      <Clock className="h-3 w-3" />
      {status}
    </span>
  );
}

// ── Metric pill ───────────────────────────────────────────────────────────────

function MetricPill({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <span className="text-xs text-neutral-500">
      {label}:{" "}
      <span
        className={
          warn
            ? "text-amber-400"
            : value >= 0.7
            ? "text-emerald-400"
            : "text-neutral-300"
        }
      >
        {(value * 100).toFixed(0)}%
      </span>
    </span>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function EvaluationPanel({
  artifactId,
  initialStatus,
  initialMetrics,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleEvaluate() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await evaluateArtifact({ artifactId });
        setStatus(result.status);
        setMetrics(result.metrics);
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Evaluation failed — try again"
        );
      }
    });
  }

  return (
    <div
      data-testid="evaluation-panel"
      className="flex flex-col gap-3 p-4 rounded-lg bg-[#111111] border border-[#2a2a2a]"
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-neutral-300">
            Quality Evaluation
          </span>
          <span className="text-xs text-neutral-500">
            Accessibility · component coverage · style consistency
          </span>
        </div>
        <EvalStatusBadge status={status} />
      </div>

      {/* Metric pills */}
      {metrics && (
        <div className="flex flex-wrap gap-3">
          <MetricPill
            label="A11y"
            value={metrics.accessibilityScore}
            warn={metrics.accessibilityScore < 0.5}
          />
          <MetricPill
            label="Coverage"
            value={metrics.componentCoverage}
            warn={metrics.componentCoverage < 0.4}
          />
          <MetricPill
            label="Style"
            value={metrics.styleConsistency}
            warn={metrics.styleConsistency < 0.5}
          />
          <MetricPill
            label="Overall"
            value={metrics.overallScore}
            warn={metrics.overallScore < 0.4}
          />
        </div>
      )}

      {/* Run button + regression warning */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleEvaluate}
          disabled={isPending}
          data-testid="run-evaluation-btn"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-violet-950/40 border border-violet-800/40 text-violet-400 hover:bg-violet-900/40 hover:border-violet-700/50 transition-colors disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <FlaskConical className="h-3 w-3" />
          )}
          {isPending ? "Evaluating…" : "Run evaluation"}
        </button>

        {status === "FAILED" && (
          <span className="flex items-center gap-1 text-xs text-red-400">
            <AlertTriangle className="h-3 w-3" />
            Regressions detected — resolve before publishing
          </span>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
