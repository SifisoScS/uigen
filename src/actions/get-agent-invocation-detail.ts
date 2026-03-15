"use server";

import { prisma } from "@/lib/prisma";

export interface AgentInvocationDetail {
  id: string;
  agentName: string;
  prompt: string;
  critiqueJson: Record<string, unknown> | null;
  createdAt: Date;
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

export interface AgentInvocationGovernanceEvent {
  id: string;
  type: string;
  actor: string | null;
  details: unknown;
  timestamp: Date;
  projectId: string;
}

export interface AgentInvocationPageData {
  invocation: AgentInvocationDetail;
  artifacts: RelatedArtifact[];
  govEvents: AgentInvocationGovernanceEvent[];
}

export async function getAgentInvocationDetail(
  id: string
): Promise<AgentInvocationPageData | null> {
  const raw = await prisma.agentInvocation.findUnique({
    where: { id },
    select: { id: true, agentName: true, prompt: true, critiqueJson: true, createdAt: true },
  });
  if (!raw) return null;

  const invocation: AgentInvocationDetail = {
    ...raw,
    critiqueJson: raw.critiqueJson as Record<string, unknown> | null,
  };

  // Resolve artifact children via ArtifactRelation
  const relations = await prisma.artifactRelation.findMany({
    where: { parentType: "AgentInvocation", parentId: id, childType: "PublicArtifact" },
  });

  const artifactIds = relations.map((r) => r.childId);
  const rawArtifacts =
    artifactIds.length > 0
      ? await prisma.publicArtifact.findMany({
          where: { id: { in: artifactIds } },
          select: {
            id: true, name: true, version: true,
            projectId: true, branchName: true, manifest: true, createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

  const artifacts: RelatedArtifact[] = rawArtifacts.map((a) => ({
    ...a,
    relationType: relations.find((r) => r.childId === a.id)?.relationType ?? "EVALUATED_BY",
  }));

  // Governance events relevant to this invocation
  const projectIds = [...new Set(rawArtifacts.map((a) => a.projectId))];
  const govEvents =
    projectIds.length > 0
      ? await prisma.governanceEvent
          .findMany({
            where: {
              projectId: { in: projectIds },
              type: "ARTIFACT_CRITIQUE_CREATED",
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

  return { invocation, artifacts, govEvents };
}
