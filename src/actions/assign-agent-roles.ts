"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ── Constants ─────────────────────────────────────────────────────────────────

export const AUTO_PUBLISH_THRESHOLD = 0.8;
export const REVIEWER_THRESHOLD    = 0.4;

export type AgentRoleType = "AUTO_PUBLISH" | "REVIEWER" | "RESTRICTED";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AssignedRole {
  agentName: string;
  role: AgentRoleType;
  reputationScore: number;
}

export interface AssignAgentRolesResult {
  projectId: string;
  assigned: AssignedRole[];
}

// ── Action ────────────────────────────────────────────────────────────────────

/**
 * Assign roles to all known agents based on their current reputation scores.
 *
 * Rules:
 *   score >= 0.8  → AUTO_PUBLISH  (trusted to publish without human review)
 *   score >= 0.4  → REVIEWER      (can suggest; human must approve)
 *   score < 0.4   → RESTRICTED    (excluded from routing; suggestions not shown)
 *
 * Upserts AgentRole records and emits AGENT_ROLE_ASSIGNED governance events
 * only when the role actually changes.
 */
export async function assignAgentRoles({
  projectId,
}: {
  projectId: string;
}): Promise<AssignAgentRolesResult> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const reputations = await prisma.agentReputation.findMany({
    select: { agentName: true, score: true },
    orderBy: { score: "desc" },
  });

  if (reputations.length === 0) {
    return { projectId, assigned: [] };
  }

  const assigned: AssignedRole[] = [];

  for (const rep of reputations) {
    const newRole: AgentRoleType =
      rep.score >= AUTO_PUBLISH_THRESHOLD
        ? "AUTO_PUBLISH"
        : rep.score >= REVIEWER_THRESHOLD
        ? "REVIEWER"
        : "RESTRICTED";

    // Read existing role to detect change
    const existing = await prisma.agentRole.findUnique({
      where: { agentName: rep.agentName },
      select: { role: true },
    });

    await prisma.agentRole.upsert({
      where: { agentName: rep.agentName },
      create: { agentName: rep.agentName, role: newRole },
      update: { role: newRole },
    });

    // Emit governance event only when role changed (or is newly created)
    if (!existing || existing.role !== newRole) {
      await prisma.governanceEvent.create({
        data: {
          projectId,
          type: "AGENT_ROLE_ASSIGNED",
          actor: "system",
          details: {
            agentName: rep.agentName,
            newRole,
            previousRole: existing?.role ?? null,
            reputationScore: rep.score,
          },
        },
      });
    }

    assigned.push({ agentName: rep.agentName, role: newRole, reputationScore: rep.score });
  }

  return { projectId, assigned };
}
