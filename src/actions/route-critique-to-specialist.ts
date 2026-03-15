"use server";

import { prisma } from "@/lib/prisma";
import { classifySuggestion, type SkillCategory } from "./analyze-agent-specializations";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RoutingResult {
  recommendedAgent: string;
  category: SkillCategory;
  score: number;
  /** True when the recommendation came from skill metrics; false = reputation fallback. */
  fromSpecialization: boolean;
}

// ── Action ────────────────────────────────────────────────────────────────────

/**
 * Select the best agent for a critique task given an artifact and an optional
 * hint about the primary concern (free-text, e.g. "add aria labels").
 *
 * Priority:
 *   1. AgentSkillMetric with highest score for the detected category
 *   2. AgentReputation (highest overall score) as fallback
 *   3. "Claude" as last-resort default
 *
 * Agents with role=RESTRICTED are excluded from routing.
 */
export async function routeCritiqueToSpecialist({
  artifactId,
  hint,
}: {
  artifactId: string;
  hint?: string;
}): Promise<RoutingResult> {
  // Determine category from hint or artifact's semantic summary
  let category: SkillCategory = "architecture";

  if (hint) {
    category = classifySuggestion(hint);
  } else {
    const artifact = await prisma.publicArtifact.findUnique({
      where: { id: artifactId },
      select: { semanticSummary: true },
    });
    if (artifact?.semanticSummary) {
      category = classifySuggestion(artifact.semanticSummary);
    }
  }

  // Exclude RESTRICTED agents
  const restrictedAgents = await prisma.agentRole.findMany({
    where: { role: "RESTRICTED" },
    select: { agentName: true },
  });
  const restricted = new Set(restrictedAgents.map((r) => r.agentName));

  // 1. Look for specialist
  const topSkill = await prisma.agentSkillMetric.findFirst({
    where: {
      category,
      agentName: { notIn: [...restricted] },
    },
    orderBy: { score: "desc" },
    select: { agentName: true, score: true },
  });

  if (topSkill) {
    return {
      recommendedAgent: topSkill.agentName,
      category,
      score: topSkill.score,
      fromSpecialization: true,
    };
  }

  // 2. Fallback to highest overall reputation
  const topReputation = await prisma.agentReputation.findFirst({
    where: { agentName: { notIn: [...restricted] } },
    orderBy: { score: "desc" },
    select: { agentName: true, score: true },
  });

  if (topReputation) {
    return {
      recommendedAgent: topReputation.agentName,
      category,
      score: topReputation.score,
      fromSpecialization: false,
    };
  }

  // 3. Last resort
  return { recommendedAgent: "Claude", category, score: 0.9, fromSpecialization: false };
}
