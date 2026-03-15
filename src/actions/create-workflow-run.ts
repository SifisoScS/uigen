"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkflowStepInput {
  stepIndex: number;
  stepType: "EVALUATE" | "CRITIQUE" | "SCORE" | "GENERATE_VARIANTS";
  inputData?: Record<string, unknown>;
}

export interface CreateWorkflowRunInput {
  name: string;
  description?: string;
  workflowId?: string;
  inputData?: Record<string, unknown>;
  outputSummary?: string;
  steps?: WorkflowStepInput[];
}

export interface WorkflowRunRecord {
  id: string;
  name: string;
  description: string | null;
  outputSummary: string | null;
  status: string;
  stepCount: number;
  createdAt: Date;
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function createWorkflowRun(
  input: CreateWorkflowRunInput
): Promise<WorkflowRunRecord> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const trimmed = input.name.trim();
  if (!trimmed) throw new Error("WorkflowRun name cannot be empty");

  const steps = input.steps ?? [];

  const run = await prisma.workflowRun.create({
    data: {
      name: trimmed,
      description: input.description ?? null,
      workflowId: input.workflowId ?? null,
      inputData: (input.inputData ?? undefined) as object | undefined,
      outputSummary: input.outputSummary ?? null,
      status: "PENDING",
      steps:
        steps.length > 0
          ? {
              create: steps.map((s) => ({
                stepIndex: s.stepIndex,
                stepType: s.stepType,
                inputData: (s.inputData ?? undefined) as object | undefined,
                status: "PENDING",
              })),
            }
          : undefined,
    },
    select: {
      id: true,
      name: true,
      description: true,
      outputSummary: true,
      status: true,
      createdAt: true,
      _count: { select: { steps: true } },
    },
  });

  return {
    id: run.id,
    name: run.name,
    description: run.description,
    outputSummary: run.outputSummary,
    status: run.status,
    stepCount: run._count.steps,
    createdAt: run.createdAt,
  };
}
