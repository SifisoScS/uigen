"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface CreateWorkflowRunInput {
  name: string;
  description?: string;
  workflowId?: string;
  inputData?: Record<string, unknown>;
  outputSummary?: string;
}

export interface WorkflowRunRecord {
  id: string;
  name: string;
  description: string | null;
  outputSummary: string | null;
  createdAt: Date;
}

export async function createWorkflowRun(
  input: CreateWorkflowRunInput
): Promise<WorkflowRunRecord> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const trimmed = input.name.trim();
  if (!trimmed) throw new Error("WorkflowRun name cannot be empty");

  const run = await prisma.workflowRun.create({
    data: {
      name: trimmed,
      description: input.description ?? null,
      workflowId: input.workflowId ?? null,
      inputData: input.inputData ?? null,
      outputSummary: input.outputSummary ?? null,
    },
    select: {
      id: true,
      name: true,
      description: true,
      outputSummary: true,
      createdAt: true,
    },
  });

  return run;
}
