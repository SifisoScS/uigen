"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SkillCategory = "accessibility" | "performance" | "ux" | "architecture";

export const SKILL_CATEGORIES: SkillCategory[] = [
  "accessibility",
  "performance",
  "ux",
  "architecture",
];

export interface AgentSkillResult {
  agentName: string;
  category: SkillCategory;
  score: number;
  sampleCount: number;
}

export interface AnalyzeAgentSpecializationsResult {
  agentName: string;
  skills: AgentSkillResult[];
}

// ── Category classifier ───────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<SkillCategory, string[]> = {
  accessibility: ["aria", "a11y", "accessible", "screen reader", "alt", "role", "label", "wcag", "focus", "keyboard"],
  performance:   ["lazy", "memo", "cache", "bundle", "optimize", "debounce", "throttle", "virtuali", "suspense"],
  ux:            ["animation", "transition", "hover", "interactive", "user experience", "feedback", "tooltip", "responsive"],
  architecture:  ["component", "reusable", "abstraction", "module", "pattern", "interface", "separation", "composable"],
};

export function classifySuggestion(text: string): SkillCategory {
  const lower = text.toLowerCase();
  let bestCategory: SkillCategory = "architecture";
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [SkillCategory, string[]][]) {
    const matches = keywords.filter((kw) => lower.includes(kw)).length;
    if (matches > bestScore) {
      bestScore = matches;
      bestCategory = category;
    }
  }

  return bestCategory;
}

// ── Action ────────────────────────────────────────────────────────────────────

/**
 * Compute per-category skill scores for an agent by mining their variant
 * Project records (which have agentName set and status APPROVED or REJECTED).
 *
 * For each project:
 *   1. Extract suggestion text from the project name (after " — ")
 *   2. Classify into a SkillCategory via keyword matching
 *   3. Accumulate approved/rejected counts per category
 *   4. Compute Laplace-smoothed score: (approved+1)/(total+2)
 *   5. Upsert AgentSkillMetric
 *
 * Logs AGENT_SPECIALIZATION_ANALYZED governance event.
 */
export async function analyzeAgentSpecializations({
  agentName,
  projectId,
}: {
  agentName: string;
  projectId: string;
}): Promise<AnalyzeAgentSpecializationsResult> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  // Fetch all agent's variant projects with known outcomes
  const projects = await prisma.project.findMany({
    where: {
      agentName,
      status: { in: ["APPROVED", "REJECTED"] },
    },
    select: { name: true, status: true },
  });

  // Accumulate counts per category
  const counts: Record<SkillCategory, { approved: number; rejected: number }> = {
    accessibility: { approved: 0, rejected: 0 },
    performance:   { approved: 0, rejected: 0 },
    ux:            { approved: 0, rejected: 0 },
    architecture:  { approved: 0, rejected: 0 },
  };

  for (const project of projects) {
    const dashIdx = project.name.indexOf(" — ");
    const suggestion = dashIdx !== -1 ? project.name.slice(dashIdx + 3) : project.name;
    const category = classifySuggestion(suggestion);
    if (project.status === "APPROVED") {
      counts[category].approved += 1;
    } else {
      counts[category].rejected += 1;
    }
  }

  // Upsert AgentSkillMetric for each category that has data (or all if no data yet)
  const skills: AgentSkillResult[] = [];

  for (const category of SKILL_CATEGORIES) {
    const { approved, rejected } = counts[category];
    const sampleCount = approved + rejected;
    const score = parseFloat(((approved + 1) / (sampleCount + 2)).toFixed(4));

    await prisma.agentSkillMetric.upsert({
      where: { agentName_category: { agentName, category } },
      create: { agentName, category, score, sampleCount },
      update: { score, sampleCount },
    });

    skills.push({ agentName, category, score, sampleCount });
  }

  // Governance event
  const topSkill = skills.reduce((best, s) => (s.score > best.score ? s : best), skills[0]);
  await prisma.governanceEvent.create({
    data: {
      projectId,
      type: "AGENT_SPECIALIZATION_ANALYZED",
      actor: "system",
      details: {
        agentName,
        topCategory: topSkill.category,
        topScore: topSkill.score,
        totalSamples: projects.length,
      },
    },
  });

  return { agentName, skills };
}
