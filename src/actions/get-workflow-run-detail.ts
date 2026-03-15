"use server";

import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkflowRunDetail {
  id: string;
  name: string;
  description: string | null;
  outputSummary: string | null;
  inputData: Record<string, unknown> | null;
  status: string;
  createdAt: Date;
}

export interface WorkflowStepSummary {
  id: string;
  stepIndex: number;
  stepType: string;
  status: string;
  durationMs: number | null;
  errorMessage: string | null;
  outputData: Record<string, unknown> | null;
}

export interface RelatedArtifact {
  id: string;
  name: string;
  version: string;
  projectId: string;
  branchName: string;
  manifest: unknown;
  createdAt: Date;
  relationType: string;
}

export interface WorkflowRunGovernanceEvent {
  id: string;
  type: string;
  actor: string | null;
  details: unknown;
  timestamp: Date;
  projectId: string;
}

export interface WorkflowRunPageData {
  run: WorkflowRunDetail;
  steps: WorkflowStepSummary[];
  artifacts: RelatedArtifact[];
  govEvents: WorkflowRunGovernanceEvent[];
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function getWorkflowRunDetail(
  id: string
): Promise<WorkflowRunPageData | null> {
  const run = await prisma.workflowRun.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      outputSummary: true,
      inputData: true,
      status: true,
      createdAt: true,
      steps: {
        select: {
          id: true,
          stepIndex: true,
          stepType: true,
          status: true,
          durationMs: true,
          errorMessage: true,
          outputData: true,
        },
        orderBy: { stepIndex: "asc" },
      },
    },
  });

  if (!run) return null;

  const steps: WorkflowStepSummary[] = run.steps.map((s) => ({
    ...s,
    outputData: s.outputData as Record<string, unknown> | null,
  }));

  // Resolve artifact children via ArtifactRelation
  const relations = await prisma.artifactRelation.findMany({
    where: { parentType: "WorkflowRun", parentId: id, childType: "PublicArtifact" },
  });

  const artifactIds = relations.map((r) => r.childId);

  const rawArtifacts =
    artifactIds.length > 0
      ? await prisma.publicArtifact.findMany({
          where: { id: { in: artifactIds } },
          select: {
            id: true,
            name: true,
            version: true,
            projectId: true,
            branchName: true,
            manifest: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

  const artifacts: RelatedArtifact[] = rawArtifacts.map((a) => ({
    ...a,
    relationType:
      relations.find((r) => r.childId === a.id)?.relationType ?? "GENERATED_BY",
  }));

  // Governance events: only ARTIFACT_RELATION_CREATED events tied to this run
  const projectIds = [...new Set(rawArtifacts.map((a) => a.projectId))];
  const govEvents =
    projectIds.length > 0
      ? await prisma.governanceEvent
          .findMany({
            where: {
              projectId: { in: projectIds },
              type: "ARTIFACT_RELATION_CREATED",
            },
            orderBy: { timestamp: "desc" },
            take: 50,
          })
          .then((rows) =>
            rows.filter((e) => {
              const d = e.details as Record<string, unknown> | null;
              return d?.parentId === id;
            })
          )
      : [];

  return {
    run: { ...run, inputData: run.inputData as Record<string, unknown> | null },
    steps,
    artifacts,
    govEvents,
  };
}
