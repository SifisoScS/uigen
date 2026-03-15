"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAgentReputationScore } from "@/lib/agent-reputation";
import type { AggregatedCritique } from "./critique-artifact";

// ── Exported types ─────────────────────────────────────────────────────────────

export interface WeightedSuggestion {
  text: string;
  /** Max reputation score across all contributing agents. */
  score: number;
  /** Agent names that independently produced this suggestion (deduplication indicator). */
  contributors: string[];
}

export interface MergedCritique {
  issues: string[];
  suggestions: string[];                    // plain deduped strings for backward compat
  weightedSuggestions: WeightedSuggestion[]; // reputation-ranked, with contributor metadata
  mergedBy: string;
  topAgentName: string;                     // agent with highest reputation score in this batch
}

// ── Action ────────────────────────────────────────────────────────────────────

/**
 * Merge multiple agent critiques into a single, reputation-weighted proposal.
 *
 * Algorithm:
 * 1. Fetch each agent's live reputation score from DB.
 * 2. Deduplicate suggestions by normalised text; track max score + all contributors.
 * 3. Sort merged suggestions by score descending (highest-confidence first).
 * 4. Persist the merge as an AgentInvocation with a CRITIQUE_MERGED_INTO relation
 *    so it appears in the lineage graph.
 * 5. Log ARTIFACT_CRITIQUE_MERGED governance event with topAgentName + topAgentScore.
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

  // 1. Fetch reputation scores for all unique contributing agents in parallel
  const agentNames = [...new Set(agentCritiques.map((c) => c.agentName))];
  const reputationScores = await Promise.all(
    agentNames.map((name) => getAgentReputationScore(name)),
  );
  const reputationMap = new Map<string, number>(
    agentNames.map((name, i) => [name, reputationScores[i]]),
  );

  // 2. Determine the top agent (highest reputation in this batch)
  const topAgentName = agentNames.reduce(
    (best, name) =>
      (reputationMap.get(name) ?? 0) > (reputationMap.get(best) ?? 0) ? name : best,
    agentNames[0],
  );

  // 3. Reputation-weighted suggestion dedup
  //    Key: normalised text  → preserves original casing from first-seen agent
  //    Score: max reputation of all contributors
  const suggMap = new Map<string, WeightedSuggestion>();
  for (const critique of agentCritiques) {
    const agentScore = reputationMap.get(critique.agentName) ?? 0.7;
    for (const sugg of critique.suggestions) {
      const key = sugg.trim().toLowerCase();
      const existing = suggMap.get(key);
      if (existing) {
        if (agentScore > existing.score) existing.score = agentScore;
        if (!existing.contributors.includes(critique.agentName)) {
          existing.contributors.push(critique.agentName);
        }
      } else {
        suggMap.set(key, { text: sugg, score: agentScore, contributors: [critique.agentName] });
      }
    }
  }
  // Sort by score descending — highest-confidence suggestions surface first
  const weightedSuggestions: WeightedSuggestion[] = [...suggMap.values()].sort(
    (a, b) => b.score - a.score,
  );

  // 4. Issue dedup (flat, keyed by normalised text — first-seen agent wins)
  const issueMap = new Map<string, string>();
  for (const critique of agentCritiques) {
    for (const issue of critique.issues) {
      const key = issue.trim().toLowerCase();
      if (!issueMap.has(key)) issueMap.set(key, issue);
    }
  }

  const merged: MergedCritique = {
    issues: [...issueMap.values()],
    suggestions: weightedSuggestions.map((ws) => ws.text),
    weightedSuggestions,
    mergedBy: "Grok",
    topAgentName,
  };

  // 5. Persist the merge as an AgentInvocation
  const invocation = await prisma.agentInvocation.create({
    data: {
      agentName: "Grok",
      prompt: "Merge multi-agent critiques",
      critiqueJson: merged as never,
    },
  });

  // 6. Link invocation into the lineage graph (CRITIQUE_MERGED_INTO)
  await prisma.artifactRelation.create({
    data: {
      parentType: "AgentInvocation",
      parentId: invocation.id,
      childType: "PublicArtifact",
      childId: artifactId,
      relationType: "CRITIQUE_MERGED_INTO",
    },
  });

  // 7. Governance audit trail
  await prisma.governanceEvent.create({
    data: {
      projectId: artifact.projectId,
      type: "ARTIFACT_CRITIQUE_MERGED",
      actor: "human-user",
      details: {
        artifactId,
        agentCount: agentCritiques.length,
        mergedBy: "Grok",
        topAgentName,
        topAgentScore: reputationMap.get(topAgentName) ?? 0.7,
        invocationId: invocation.id,
      },
    },
  });

  return { mergedCritique: merged, invocationId: invocation.id };
}
