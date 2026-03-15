"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { evaluateArtifact } from "@/actions/evaluate-artifact";

// ── Types ─────────────────────────────────────────────────────────────────────

export type WorkflowStepType =
  | "EVALUATE"
  | "CRITIQUE"
  | "SCORE"
  | "GENERATE_VARIANTS";

export interface ExecuteWorkflowStepResult {
  stepId: string;
  status: "COMPLETED" | "FAILED";
  durationMs: number;
  outputData: Record<string, unknown>;
}

// ── Action ────────────────────────────────────────────────────────────────────

/**
 * Execute a single WorkflowStep by its id.
 *
 * The step record's `inputData` contains the parameters required by the
 * step type.  After execution the step row is updated with `outputData`,
 * `durationMs`, and `status`.  If all steps in the run are now COMPLETED
 * the parent WorkflowRun is promoted to COMPLETED; if any step FAILED the
 * run is set to FAILED.
 *
 * Governance events emitted (against `projectId`):
 *   - WORKFLOW_STEP_STARTED  (always, at start)
 *   - WORKFLOW_STEP_COMPLETED (on success)
 *   - WORKFLOW_STEP_FAILED   (on failure)
 *   - WORKFLOW_RUN_COMPLETED (when run finishes — COMPLETED or FAILED)
 */
export async function executeWorkflowStep({
  stepId,
  projectId,
}: {
  stepId: string;
  projectId: string;
}): Promise<ExecuteWorkflowStepResult> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const step = await prisma.workflowStep.findUnique({ where: { id: stepId } });
  if (!step) throw new Error("WorkflowStep not found");
  if (step.status === "COMPLETED" || step.status === "RUNNING") {
    throw new Error(`Step is already ${step.status}`);
  }

  // Mark RUNNING
  await prisma.workflowStep.update({
    where: { id: stepId },
    data: { status: "RUNNING", updatedAt: new Date() },
  });

  // Mark parent run as RUNNING if it is still PENDING
  await prisma.workflowRun.updateMany({
    where: { id: step.runId, status: "PENDING" },
    data: { status: "RUNNING" },
  });

  await prisma.governanceEvent.create({
    data: {
      projectId,
      type: "WORKFLOW_STEP_STARTED",
      actor: "system",
      details: {
        stepId,
        runId: step.runId,
        stepType: step.stepType,
        stepIndex: step.stepIndex,
      },
    },
  });

  const startedAt = Date.now();
  let outputData: Record<string, unknown> = {};
  let finalStatus: "COMPLETED" | "FAILED" = "COMPLETED";
  let errorMessage: string | null = null;

  try {
    const input = (step.inputData ?? {}) as Record<string, unknown>;
    outputData = await dispatchStep(step.stepType as WorkflowStepType, input);
  } catch (err) {
    finalStatus = "FAILED";
    errorMessage = err instanceof Error ? err.message : String(err);
    outputData = { error: errorMessage };
  }

  const durationMs = Date.now() - startedAt;

  // Persist result on step
  await prisma.workflowStep.update({
    where: { id: stepId },
    data: {
      status: finalStatus,
      outputData: outputData as never,
      durationMs,
      errorMessage,
      updatedAt: new Date(),
    },
  });

  // Emit step result event
  await prisma.governanceEvent.create({
    data: {
      projectId,
      type:
        finalStatus === "COMPLETED"
          ? "WORKFLOW_STEP_COMPLETED"
          : "WORKFLOW_STEP_FAILED",
      actor: "system",
      details: {
        stepId,
        runId: step.runId,
        stepType: step.stepType,
        stepIndex: step.stepIndex,
        durationMs,
        ...(errorMessage ? { error: errorMessage } : {}),
      },
    },
  });

  // Check whether the whole run has finished
  const allSteps = await prisma.workflowStep.findMany({
    where: { runId: step.runId },
    select: { status: true },
  });

  const allDone = allSteps.every(
    (s) => s.status === "COMPLETED" || s.status === "FAILED"
  );
  if (allDone) {
    const anyFailed = allSteps.some((s) => s.status === "FAILED");
    const runFinalStatus = anyFailed ? "FAILED" : "COMPLETED";

    await prisma.workflowRun.update({
      where: { id: step.runId },
      data: { status: runFinalStatus },
    });

    await prisma.governanceEvent.create({
      data: {
        projectId,
        type: "WORKFLOW_RUN_COMPLETED",
        actor: "system",
        details: {
          runId: step.runId,
          status: runFinalStatus,
          totalSteps: allSteps.length,
          failedSteps: allSteps.filter((s) => s.status === "FAILED").length,
        },
      },
    });
  }

  return { stepId, status: finalStatus, durationMs, outputData };
}

// ── Step dispatcher ────────────────────────────────────────────────────────────

async function dispatchStep(
  stepType: WorkflowStepType,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  switch (stepType) {
    case "EVALUATE": {
      const artifactId = input.artifactId as string;
      if (!artifactId) throw new Error("EVALUATE step requires artifactId in inputData");
      const result = await evaluateArtifact({
        artifactId,
        baselineArtifactId: input.baselineArtifactId as string | undefined,
      });
      return {
        evaluationRunId: result.evaluationRunId,
        status: result.status,
        overallScore: result.metrics.overallScore,
        regressionDetected: result.regressionDetected,
      };
    }

    case "CRITIQUE": {
      // Stub: returns recorded input; real integration wires critiqueArtifact
      const artifactId = input.artifactId as string;
      if (!artifactId) throw new Error("CRITIQUE step requires artifactId in inputData");
      return { artifactId, note: "Critique step queued for agent invocation" };
    }

    case "SCORE": {
      const artifactId = input.artifactId as string;
      if (!artifactId) throw new Error("SCORE step requires artifactId in inputData");
      return { artifactId, note: "Score step queued for suggestion scoring" };
    }

    case "GENERATE_VARIANTS": {
      const artifactId = input.artifactId as string;
      if (!artifactId) throw new Error("GENERATE_VARIANTS step requires artifactId in inputData");
      return { artifactId, note: "Variant generation step queued" };
    }

    default:
      throw new Error(`Unknown step type: ${stepType}`);
  }
}
