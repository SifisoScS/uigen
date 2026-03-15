"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { AggregatedCritique } from "./critique-artifact";

// ── Exported types ─────────────────────────────────────────────────────────────

export interface MergedCritique {
  issues: string[];
  suggestions: string[];
  mergedBy: string;
}

// ── Action ────────────────────────────────────────────────────────────────────

/**
 * Merge multiple agent critiques into a single, deduplicated proposal.
 *
 * This is a human-gated operation (requires an active session).  It uses a
 * stub LLM merge — deduplication via Set — and records the result as an
 * AgentInvocation plus an ARTIFACT_CRITIQUE_MERGED governance event.
 */
export async function coordinateCritiques({
  artifactId,
  agentCritiques,
}: {
  artifactId: string;
  agentCritiques: AggregatedCritique[];
}): Promise<{ mergedCritique: MergedCritique; invocationId: string }> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  if (!agentCritiques || agentCritiques.length === 0) {
    throw new Error("No agent critiques provided");
  }

  // Verify artifact exists and retrieve projectId for governance events
  const artifact = await prisma.publicArtifact.findUnique({
    where: { id: artifactId },
    select: { id: true, projectId: true },
  });
  if (!artifact) throw new Error("Artifact not found");

  // Stub LLM merge — deduplicate issues and suggestions across all agents
  const merged: MergedCritique = {
    issues: [...new Set(agentCritiques.flatMap((c) => c.issues))],
    suggestions: [...new Set(agentCritiques.flatMap((c) => c.suggestions))],
    mergedBy: "Grok",
  };

  // Persist the merge as an AgentInvocation
  const invocation = await prisma.agentInvocation.create({
    data: {
      agentName: "Grok",
      prompt: "Merge multi-agent critiques",
      critiqueJson: merged as never,
    },
  });

  // Governance audit trail
  await prisma.governanceEvent.create({
    data: {
      projectId: artifact.projectId,
      type: "ARTIFACT_CRITIQUE_MERGED",
      actor: "human-user",
      details: {
        artifactId,
        agentCount: agentCritiques.length,
        mergedBy: "Grok",
        invocationId: invocation.id,
      },
    },
  });

  return { mergedCritique: merged, invocationId: invocation.id };
}
