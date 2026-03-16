"use server";

import { ikhayaMANCEDeliberate, type MANCEDeliberateResponse } from "@/lib/ikhaya";

export interface MergedSuggestionContext {
  text: string;
  score?: number;
}

export interface GetIKhayaManceNarrativeInput {
  artifactId: string;
  /** Agent names present in the critique panel (e.g. "Claude", "Grok"). */
  agentNames: string[];
  /** One-line prompt describing the deliberation topic. */
  prompt: string;
  /** Merged suggestions from coordinateCritiques — triggers critique_event in PKL. */
  mergedSuggestions?: MergedSuggestionContext[];
  /** Name of the reputation-leading agent, if known. */
  topAgent?: string;
}

/**
 * Constructs synthetic DIDs for critique agents (which are identified by name only)
 * and calls /api/ikhaya/mance-deliberate.
 *
 * The SOVEREIGN_CONTRACT (§3.1) mandates did:key:z prefix.
 * Synthetic format: did:key:z{agentName.toLowerCase()} — stable per-agent ID.
 */
export async function getIKhayaManceNarrative(
  input: GetIKhayaManceNarrativeInput
): Promise<MANCEDeliberateResponse> {
  const agents = input.agentNames.map((name) => ({
    did: `did:key:z${name.toLowerCase()}`,
    name,
  }));

  const context: Record<string, unknown> = {
    artifactId: input.artifactId,
  };

  if (input.mergedSuggestions && input.mergedSuggestions.length > 0) {
    context.mergedSuggestions = input.mergedSuggestions;
  }

  if (input.topAgent) {
    context.topAgent = input.topAgent;
  }

  return ikhayaMANCEDeliberate({ agents, prompt: input.prompt, context });
}
