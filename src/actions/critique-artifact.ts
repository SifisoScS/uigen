"use server";

import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAgentReputationScore } from "@/lib/agent-reputation";
import { writePresenceObservation } from "@/lib/pkl-bridge";
import { routeCritiqueToSpecialist } from "@/actions/route-critique-to-specialist";

// ── Critique schema ────────────────────────────────────────────────────────────

const critiqueSchema = z.object({
  issues: z.array(z.string()).describe("Concrete accessibility or UX issues found in the component"),
  suggestions: z.array(z.string()).describe("Actionable improvement suggestions"),
});

// ── Default stub critiques ─────────────────────────────────────────────────────

const DEFAULT_CRITIQUE = {
  suggestions: [
    "Add aria-label to interactive elements for screen reader support",
    "Consider using shadcn Button instead of a plain <button> element",
    "Extract repeated color utilities into a consistent theme token",
  ],
  issues: [
    "Missing keyboard navigation on custom interactive elements",
    "Potential color contrast issues in dark mode",
  ],
};

/** Stub critique returned for the Grok agent (no external API available). */
const GROK_DEFAULT_CRITIQUE = {
  suggestions: [
    "Replace custom dropdown with shadcn Select for keyboard support",
    "Add loading state to async buttons using disabled + spinner pattern",
    "Use semantic HTML elements (button vs div) for interactive controls",
  ],
  issues: [
    "Custom dropdown lacks aria-expanded attribute",
    "Button click handlers missing keyboard event support",
  ],
};

// ── Agent reputation stubs ────────────────────────────────────────────────────

/** Reputation scores used to weight critique priority. Range: 0–1. */
export const AGENT_REPUTATION: Record<string, number> = {
  Claude: 0.9,
  Grok: 0.85,
};

/** Fallback reputation for unknown agents. */
const DEFAULT_REPUTATION = 0.7;

// ── Aggregated critique type (exported for UI consumption) ───────────────────

export interface AggregatedCritique {
  agentName: string;
  issues: string[];
  suggestions: string[];
  priority: number;
  /** priority × agentReputation — higher is better. */
  finalScore: number;
  invocationId: string;
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildCritiquePrompt(
  artifactName: string,
  semanticSummary: string | null,
  componentTree: unknown,
  styleSignature: unknown,
): string {
  const lines: string[] = [
    `Critique this React UI component for accessibility, performance, and shadcn/Tailwind best practices.`,
    ``,
    `Component: ${artifactName}`,
  ];
  if (semanticSummary) lines.push(`Summary: ${semanticSummary}`);
  if (componentTree) lines.push(`Component tree: ${JSON.stringify(componentTree).slice(0, 400)}`);
  if (styleSignature) lines.push(`Style signature: ${JSON.stringify(styleSignature).slice(0, 400)}`);
  lines.push(``, `Return 2–4 issues and 2–4 actionable suggestions.`);
  return lines.join("\n");
}

// ── Per-agent critique runner ─────────────────────────────────────────────────

/** Run a critique for a single named agent. Grok is always a stub. */
async function runAgentCritique(
  agentName: string,
  prompt: string,
  apiKey: string | undefined,
): Promise<{ issues: string[]; suggestions: string[] }> {
  // Grok is always a stub — no external Grok API wired
  if (agentName === "Grok") {
    return GROK_DEFAULT_CRITIQUE;
  }

  // Claude — use real LLM when API key is present
  if (apiKey && apiKey.trim() !== "") {
    try {
      const { object } = await generateObject({
        model: anthropic("claude-sonnet-4-6"),
        schema: critiqueSchema,
        prompt,
      });
      return object;
    } catch {
      // LLM call failed — keep DEFAULT_CRITIQUE
    }
  }

  return DEFAULT_CRITIQUE;
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function critiqueArtifact({
  artifactId,
  agentName = "StubAgent",
  prompt,
  agents,
}: {
  artifactId: string;
  agentName?: string;
  prompt?: string;
  /**
   * When provided, runs a parallel multi-agent critique (no auto-variant creation).
   * Each element is an agent name; "Claude" uses the real LLM, "Grok" is a stub.
   */
  agents?: string[];
}) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  // 1. Verify artifact exists and fetch introspection data
  const artifact = await prisma.publicArtifact.findUnique({
    where: { id: artifactId },
    select: {
      id: true,
      projectId: true,
      name: true,
      filesData: true,
      semanticSummary: true,
      componentTree: true,
      styleSignature: true,
    },
  });
  if (!artifact) throw new Error("Artifact not found");

  const critiquePrompt =
    prompt ??
    buildCritiquePrompt(
      artifact.name,
      artifact.semanticSummary,
      artifact.componentTree,
      artifact.styleSignature,
    );

  const apiKey = process.env.ANTHROPIC_API_KEY;

  // ── Multi-agent mode ───────────────────────────────────────────────────────

  if (agents && agents.length > 0) {
    // Phase 21: reorder agents so the specialist appears first (highest priority)
    let orderedAgents = [...agents];
    const routing = await routeCritiqueToSpecialist({ artifactId }).catch(() => null);
    if (routing?.fromSpecialization && orderedAgents.includes(routing.recommendedAgent)) {
      const idx = orderedAgents.indexOf(routing.recommendedAgent);
      if (idx > 0) {
        orderedAgents = [routing.recommendedAgent, ...orderedAgents.filter((_, i) => i !== idx)];
      }
    }

    // Run all agent critiques in parallel
    const critiqueResults = await Promise.all(
      orderedAgents.map((name) => runAgentCritique(name, critiquePrompt, apiKey))
    );

    // Fetch reputations from DB in parallel
    const reputations = await Promise.all(
      orderedAgents.map((name) => getAgentReputationScore(name))
    );

    // Persist one AgentInvocation per agent and collect aggregated critiques
    const aggregatedCritiques: AggregatedCritique[] = [];

    for (let i = 0; i < orderedAgents.length; i++) {
      const name = orderedAgents[i];
      const result = critiqueResults[i];
      const priority = i + 1; // 1-indexed; first agent = highest priority
      const reputation = reputations[i];
      // Divide by priority so that lower priority number (= more important) yields a higher score
      const finalScore = parseFloat((reputation / priority).toFixed(4));

      const invocation = await prisma.agentInvocation.create({
        data: {
          agentName: name,
          prompt: critiquePrompt,
          critiqueJson: result,
        },
      });

      await prisma.artifactRelation.create({
        data: {
          parentType: "AgentInvocation",
          parentId: invocation.id,
          childType: "PublicArtifact",
          childId: artifactId,
          relationType: "EVALUATED_BY",
        },
      });

      await prisma.governanceEvent.create({
        data: {
          projectId: artifact.projectId,
          type: "ARTIFACT_CRITIQUE_CREATED",
          actor: name.toLowerCase(),
          details: {
            parentType: "AgentInvocation",
            parentId: invocation.id,
            childId: artifactId,
            relationType: "EVALUATED_BY",
            agentName: name,
            agentCount: orderedAgents.length,
            topSuggestion: (result.suggestions[0] ?? "").slice(0, 80),
          },
        },
      });

      aggregatedCritiques.push({
        agentName: name,
        issues: result.issues,
        suggestions: result.suggestions,
        priority,
        finalScore,
        invocationId: invocation.id,
      });
    }

    // Sort by finalScore descending — highest-ranked agent first
    aggregatedCritiques.sort((a, b) => b.finalScore - a.finalScore);

    // PKL memory write — fail-open
    await writePresenceObservation({
      key: `uigen:critique_completed:${artifactId}`,
      value: {
        event_type: "critique_completed",
        artifact_id: artifactId,
        agent_count: aggregatedCritiques.length,
        top_agent_name: aggregatedCritiques[0]?.agentName ?? null,
        top_agent_score: aggregatedCritiques[0]?.finalScore ?? 0,
        timestamp: Date.now(),
      },
      category: "uigen",
    });

    // In multi-agent mode: no auto-variant creation — user selects via generateSelectedVariants
    return {
      invocationId: aggregatedCritiques[0]?.invocationId ?? "",
      variantIds: [] as string[],
      aggregatedCritiques,
    };
  }

  // ── Single-agent mode (backward-compatible) ────────────────────────────────

  let critiqueJson: { issues: string[]; suggestions: string[] } = DEFAULT_CRITIQUE;
  if (apiKey && apiKey.trim() !== "") {
    try {
      const { object } = await generateObject({
        model: anthropic("claude-sonnet-4-6"),
        schema: critiqueSchema,
        prompt: critiquePrompt,
      });
      critiqueJson = object;
    } catch {
      // LLM call failed — keep DEFAULT_CRITIQUE
    }
  }

  const invocation = await prisma.agentInvocation.create({
    data: {
      agentName,
      prompt: critiquePrompt,
      critiqueJson,
    },
  });

  await prisma.artifactRelation.create({
    data: {
      parentType: "AgentInvocation",
      parentId: invocation.id,
      childType: "PublicArtifact",
      childId: artifactId,
      relationType: "EVALUATED_BY",
    },
  });

  await prisma.governanceEvent.create({
    data: {
      projectId: artifact.projectId,
      type: "ARTIFACT_CRITIQUE_CREATED",
      actor: agentName.toLowerCase(),
      details: {
        parentType: "AgentInvocation",
        parentId: invocation.id,
        childId: artifactId,
        relationType: "EVALUATED_BY",
        agentName,
      },
    },
  });

  // Auto-variant generation: one Project stub per suggestion
  const variantIds: string[] = [];
  for (const suggestion of critiqueJson.suggestions) {
    const variant = await prisma.project.create({
      data: {
        name: `${artifact.name} — ${suggestion.slice(0, 50)}`,
        data: artifact.filesData,
        agentName,
      },
    });

    await prisma.artifactRelation.create({
      data: {
        parentType: "PublicArtifact",
        parentId: artifactId,
        childType: "Project",
        childId: variant.id,
        relationType: "NEW_VARIANT_OF",
      },
    });

    await prisma.governanceEvent.create({
      data: {
        projectId: artifact.projectId,
        type: "ARTIFACT_VARIANT_CREATED",
        actor: agentName.toLowerCase(),
        details: {
          parentId: artifactId,
          childId: variant.id,
          suggestion,
        },
      },
    });

    variantIds.push(variant.id);
  }

  const reputation = await getAgentReputationScore(agentName);
  const finalScore = parseFloat((reputation / 1).toFixed(4));

  // PKL memory write — fail-open
  await writePresenceObservation({
    key: `uigen:critique_completed:${artifactId}`,
    value: {
      event_type: "critique_completed",
      artifact_id: artifactId,
      agent_count: 1,
      top_agent_name: agentName,
      top_agent_score: finalScore,
      timestamp: Date.now(),
    },
    category: "uigen",
  });

  return {
    invocationId: invocation.id,
    variantIds,
    aggregatedCritiques: [
      {
        agentName,
        issues: critiqueJson.issues,
        suggestions: critiqueJson.suggestions,
        priority: 1,
        finalScore,
        invocationId: invocation.id,
      },
    ] as AggregatedCritique[],
  };
}
