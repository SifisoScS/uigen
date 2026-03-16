"use server";

import { ikhayaNarrate, type NarrateResponse } from "@/lib/ikhaya";

export interface GetIKhayaNarrativeInput {
  artifactId: string;
  variantId?: string;
  ubuntuScore: number;
  gateLogEntryId: string;
  semanticDelta?: {
    a11yDelta?: number;
    linesChanged?: number;
    addedComponents?: string[];
    removedComponents?: string[];
  };
  agentDid?: string;
}

export async function getIKhayaNarrative(
  input: GetIKhayaNarrativeInput
): Promise<NarrateResponse> {
  return ikhayaNarrate({
    artifact_id: input.artifactId,
    variant_id: input.variantId,
    ubuntu_score: input.ubuntuScore,
    gate_log_entry_id: input.gateLogEntryId,
    semantic_delta: input.semanticDelta,
    agent_did: input.agentDid,
  });
}
