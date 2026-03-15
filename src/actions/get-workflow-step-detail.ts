"use server";

import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkflowStepDetail {
  id: string;
  runId: string;
  stepIndex: number;
  stepType: string;
  status: string;
  inputData: Record<string, unknown> | null;
  outputData: Record<string, unknown> | null;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function getWorkflowStepDetail(
  stepId: string
): Promise<WorkflowStepDetail | null> {
  const step = await prisma.workflowStep.findUnique({
    where: { id: stepId },
    select: {
      id: true,
      runId: true,
      stepIndex: true,
      stepType: true,
      status: true,
      inputData: true,
      outputData: true,
      durationMs: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!step) return null;

  return {
    ...step,
    inputData: step.inputData as Record<string, unknown> | null,
    outputData: step.outputData as Record<string, unknown> | null,
  };
}

export async function getWorkflowStepsByRun(
  runId: string
): Promise<WorkflowStepDetail[]> {
  const steps = await prisma.workflowStep.findMany({
    where: { runId },
    select: {
      id: true,
      runId: true,
      stepIndex: true,
      stepType: true,
      status: true,
      inputData: true,
      outputData: true,
      durationMs: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { stepIndex: "asc" },
  });

  return steps.map((s) => ({
    ...s,
    inputData: s.inputData as Record<string, unknown> | null,
    outputData: s.outputData as Record<string, unknown> | null,
  }));
}
