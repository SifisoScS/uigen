"use server";

import { getSession } from "@/lib/auth";
import { processGovernanceEvent } from "@/lib/governance/rule-engine";
import type { ProcessEventResult } from "@/lib/governance/rule-engine";

export type { ProcessEventResult };

/**
 * Server action: run the governance rule engine against an event.
 *
 * Call this immediately after emitting a GovernanceEvent whose type may
 * have reactive rules attached (EVALUATION_RUN_COMPLETED, AGENT_REPUTATION_UPDATED,
 * ARTIFACT_VARIANT_PUBLISHED, or any custom DB rule type).
 */
export async function processGovernanceEventAction({
  type,
  projectId,
  details,
}: {
  type: string;
  projectId: string;
  details: Record<string, unknown>;
}): Promise<ProcessEventResult> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  return processGovernanceEvent({ type, projectId, details });
}
