"use server";

import { prisma } from "@/lib/prisma";
import { critiqueArtifact } from "@/actions/critique-artifact";
import { buildInitiationNarration } from "@/lib/ikhaya-narration";

// ── Types ─────────────────────────────────────────────────────────────────────

export type InitiationActionTaken =
  | "none"
  | "critique_triggered"
  | "narration_generated";

export interface InitiationResult {
  actionTaken: InitiationActionTaken;
  narration: string;
}

// ── Action ────────────────────────────────────────────────────────────────────

/**
 * Process a single PKL presence observation and initiate the appropriate action.
 *
 * Trigger rules:
 *   - category=uigen + event_type=evaluation_completed + status=FAILED
 *       → auto-trigger critique on artifactId (fail-open on auth errors)
 *   - category=uigen + event_type=critique_completed + agent_count > 2
 *       → log multi-agent deliberation narration
 *   - category=forge + event_type=mesh_published
 *       → log mesh narration
 *
 * Always logs a PRESENCE_INITIATED governance event when an action is taken
 * and a projectId can be resolved from the observation's artifact_id.
 */
export async function initiateFromPresence(
  observation: Record<string, unknown>
): Promise<InitiationResult> {
  const category = observation.category as string | undefined;
  const eventType = observation.event_type as string | undefined;
  const artifactId = (observation.artifact_id ?? observation.artifactId) as
    | string
    | undefined;
  const status = observation.status as string | undefined;
  const agentCount = observation.agent_count as number | undefined;

  const narration = buildInitiationNarration(observation);
  let actionTaken: InitiationActionTaken = "none";

  // ── Trigger: FAILED evaluation → auto-critique ────────────────────────────
  if (
    category === "uigen" &&
    eventType === "evaluation_completed" &&
    status === "FAILED" &&
    artifactId
  ) {
    actionTaken = "critique_triggered";
    // System-initiated; auth may be unavailable — silently ignore failures
    await critiqueArtifact({ artifactId }).catch(() => {});
  }

  // ── Trigger: multi-agent critique → narration ─────────────────────────────
  else if (
    category === "uigen" &&
    eventType === "critique_completed" &&
    typeof agentCount === "number" &&
    agentCount > 2
  ) {
    actionTaken = "narration_generated";
  }

  // ── Trigger: forge mesh_published → narration ─────────────────────────────
  else if (category === "forge" && eventType === "mesh_published") {
    actionTaken = "narration_generated";
  }

  // ── Governance: PRESENCE_INITIATED ───────────────────────────────────────
  if (artifactId && actionTaken !== "none") {
    try {
      const artifact = await prisma.publicArtifact.findUnique({
        where: { id: artifactId },
        select: { projectId: true },
      });

      if (artifact?.projectId) {
        await prisma.governanceEvent.create({
          data: {
            projectId: artifact.projectId,
            type: "PRESENCE_INITIATED",
            actor: "system",
            details: {
              triggerObservationId:
                (observation.id as string | undefined) ??
                (observation.key as string | undefined) ??
                null,
              actionTaken,
              category,
              event_type: eventType,
              artifact_id: artifactId,
              narration: narration.message,
            },
          },
        });
      }
    } catch {
      // fail-open — governance logging must never block primary flow
    }
  }

  return { actionTaken, narration: narration.message };
}
