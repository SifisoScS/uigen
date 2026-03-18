import { prisma } from "@/lib/prisma";
import { processGovernanceEvent } from "@/lib/governance/rule-engine";

// Seed scores matching AGENT_REPUTATION in critique-artifact.ts (kept local to avoid circular import)
const REPUTATION_SEED: Record<string, number> = {
  Claude: 0.9,
  Grok: 0.85,
};

const DEFAULT_REPUTATION = 0.7;

/**
 * Returns the agent's current reputation score from the DB.
 * Falls back to the hardcoded seed score, then DEFAULT_REPUTATION for unknown agents.
 */
export async function getAgentReputationScore(agentName: string): Promise<number> {
  const record = await prisma.agentReputation.findFirst({
    where: { agentName },
  });
  if (record) return record.score;
  return REPUTATION_SEED[agentName] ?? DEFAULT_REPUTATION;
}

/**
 * Records a human approval or rejection outcome for a variant suggestion.
 * Upserts the AgentReputation row, recomputes the Laplace-smoothed score, and
 * logs an AGENT_REPUTATION_UPDATED governance event.
 *
 * Score formula: (approvedCount + 1) / (approvedCount + rejectedCount + 2)
 */
export async function recordVariantOutcome(
  agentName: string,
  approved: boolean,
  projectId: string,
  parentArtifactId: string,
): Promise<void> {
  const seedScore = REPUTATION_SEED[agentName] ?? DEFAULT_REPUTATION;

  // 1. Upsert — create with seed score if new agent, no-op update if already present
  await prisma.agentReputation.upsert({
    where: { agentName },
    create: { agentName, score: seedScore, approvedCount: 0, rejectedCount: 0 },
    update: {},
  });

  // 2. Read current counts
  const record = await prisma.agentReputation.findUnique({
    where: { agentName },
  });
  const currentApproved = record?.approvedCount ?? 0;
  const currentRejected = record?.rejectedCount ?? 0;

  // 3. Laplace-smoothed score
  const newApproved = currentApproved + (approved ? 1 : 0);
  const newRejected = currentRejected + (approved ? 0 : 1);
  const newScore = parseFloat(
    ((newApproved + 1) / (newApproved + newRejected + 2)).toFixed(4),
  );

  // 4. Persist
  await prisma.agentReputation.update({
    where: { agentName },
    data: { score: newScore, approvedCount: newApproved, rejectedCount: newRejected },
  });

  // 5. Governance event
  await prisma.governanceEvent.create({
    data: {
      projectId,
      type: "AGENT_REPUTATION_UPDATED",
      actor: "system",
      details: { agentName, approved, newScore, newApproved, newRejected, parentArtifactId },
    },
  });

  // 6. Rule engine — fire-and-forget; non-fatal
  processGovernanceEvent({
    type: "AGENT_REPUTATION_UPDATED",
    projectId,
    details: { agentName, newScore },
  }).catch(() => undefined);
}
