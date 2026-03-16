/**
 * iKhaya Narration — Phase 38
 *
 * Pure functions for generating natural-language narration messages
 * when iKhaya initiates proactive actions from PKL presence patterns.
 *
 * No external I/O — always synchronous and safe to call anywhere server-side.
 */

export type InitiationSeverity = "info" | "concern" | "alert";
export type InitiationTriggerType =
  | "evaluation_failed"
  | "multi_agent_critique"
  | "mesh_published"
  | "generic";

export interface InitiationNarration {
  /** Human-readable message surfaced to the user or logged with the event. */
  message: string;
  /** Structural classification of the trigger. */
  triggerType: InitiationTriggerType;
  /** Artifact ID the narration concerns, if available. */
  artifactId?: string;
  /** Urgency level — drives UI presentation and alert routing. */
  severity: InitiationSeverity;
}

/**
 * Build a narration for a PKL observation that triggered a proactive action.
 *
 * Classifies the observation and generates an appropriate message:
 *   - FAILED evaluation  → "alert" — suggests re-critique
 *   - Multi-agent critique (agentCount > 2) → "info" — deliberation note
 *   - Forge mesh_published → "info" — new artifact available
 *   - Anything else       → "generic" / "info"
 */
export function buildInitiationNarration(
  observation: Record<string, unknown>
): InitiationNarration {
  const category = observation.category as string | undefined;
  const eventType = observation.event_type as string | undefined;
  const artifactId = (observation.artifact_id ?? observation.artifactId) as string | undefined;
  const status = observation.status as string | undefined;
  const agentCount = observation.agent_count as number | undefined;

  // ── FAILED evaluation ───────────────────────────────────────────────────────
  if (
    category === "uigen" &&
    eventType === "evaluation_completed" &&
    status === "FAILED"
  ) {
    const target = artifactId ? `artifact '${artifactId}'` : "a component";
    return {
      message:
        `I noticed a quality concern with ${target} — shall we critique it again? ` +
        "The evaluation score fell below the passing threshold.",
      triggerType: "evaluation_failed",
      artifactId,
      severity: "alert",
    };
  }

  // ── Multi-agent deliberation (agent_count > 2) ──────────────────────────────
  if (
    category === "uigen" &&
    eventType === "critique_completed" &&
    typeof agentCount === "number" &&
    agentCount > 2
  ) {
    const target = artifactId ? `artifact '${artifactId}'` : "a component";
    return {
      message:
        `A multi-agent deliberation of ${agentCount} agents has completed for ${target}. ` +
        "Review the aggregated critique to see where the council agrees.",
      triggerType: "multi_agent_critique",
      artifactId,
      severity: "info",
    };
  }

  // ── Forge mesh_published ────────────────────────────────────────────────────
  if (category === "forge" && eventType === "mesh_published") {
    const target = artifactId ? `artifact '${artifactId}'` : "a new artifact";
    return {
      message:
        `A new mesh artifact has been published: ${target}. ` +
        "It is now available for lineage traversal and cross-node evaluation.",
      triggerType: "mesh_published",
      artifactId,
      severity: "info",
    };
  }

  // ── Generic fallback ────────────────────────────────────────────────────────
  return {
    message:
      `iKhaya observed a presence event (${category ?? "unknown"}:${eventType ?? "unknown"}) ` +
      "and is monitoring for further patterns.",
    triggerType: "generic",
    artifactId,
    severity: "info",
  };
}
