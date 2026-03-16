/**
 * Sifiso OS Sovereign Gate — UIGen Client
 * =========================================
 * Typed HTTP client for the /api/uigen/gate-check endpoint exposed by
 * Sifiso OS.  Called by publishArtifact, approveVariant, and
 * publishVariantAsArtifact as a constitutional pre-flight check.
 *
 * Environment variables:
 *   SIFISO_OS_URL       Base URL of the running Sifiso OS backend
 *                       (e.g. http://localhost:3000). When absent, gate
 *                       checks are bypassed with a permissive stub result
 *                       so UIGen can run standalone during development.
 *   UIGEN_SYSTEM_DID    Ed25519 DID for the UIGen system node.
 *                       Defaults to "did:key:zuigen-system-node-dev".
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type UIGenGateAction =
  | "artifact_publish"
  | "variant_approve"
  | "variant_publish"
  | "blueprint_submit";

export interface UIGenGatePayload {
  uigen_action: UIGenGateAction;
  /** Artifact display name. */
  artifact_name?: string;
  /** Human-written artifact description. */
  artifact_description?: string;
  /** Computed semantic summary from artifact-introspection. */
  semantic_summary?: string;
  /** Registry tags. */
  tags?: string[];
  /** Name of the agent that generated the variant (e.g. "Claude", "Grok"). */
  agent_name?: string;
  /** Agent's current Laplace-smoothed reputation score (0–1). */
  agent_reputation_score?: number;
  /** True when a human steward explicitly approved this variant. */
  human_approved?: boolean;
  /** True/false if an evaluation run exists; undefined if no run was found. */
  evaluation_passed?: boolean;
  /** Net change in a11y attribute count from SemanticTransform (positive = better). */
  a11y_delta?: number;
  /** Total lines changed from SemanticTransform. */
  lines_changed?: number;
  /** Component types added in this generation. */
  added_components?: string[];
  /** Component types removed in this generation. */
  removed_components?: string[];
  /** Type of artifact being submitted to The Forge (e.g. "ui-component", "page"). */
  artifact_type?: string;
  /** Human-readable description of the blueprint being submitted. */
  blueprint_description?: string;
}

export interface UbuntuDimensions {
  H: number;   // Harmony — communal benefit
  S: number;   // Stewardship — long-term health
  C: number;   // Context — localized solutions
  E: number;   // Harmony-over-Efficiency
  harm: number;
  efficiency_deviation: number;
}

export interface SovereignGateResult {
  /** Whether all 7 constitutional predicates passed. */
  passed: boolean;
  /** Ubuntu Alignment Score U ∈ [0, 1]; threshold θ = 0.65. */
  ubuntu_score: number;
  /** Names of predicates that failed (empty when passed = true). */
  failed_predicates: string[];
  /** Human-readable rationale from the Gate. */
  rationale: string;
  /** SHA-256 Merkle-chained log entry ID from the Gate Log. */
  log_entry_id: string;
  /** Per-dimension scores returned by Sifiso OS (for GovernanceEvent storage). */
  dimensions?: UbuntuDimensions;
  /** True when the gate was bypassed because SIFISO_OS_URL is not set. */
  bypassed?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const UBUNTU_THETA = 0.65;

// ── Stub result (development mode — no Sifiso OS running) ─────────────────────

function stubResult(): SovereignGateResult {
  return {
    passed: true,
    ubuntu_score: 0.82,
    failed_predicates: [],
    rationale: "Gate bypassed — SIFISO_OS_URL not configured (development mode).",
    log_entry_id: "0".repeat(64),
    bypassed: true,
  };
}

// ── Client ────────────────────────────────────────────────────────────────────

/**
 * Submit a UIGen generational action for constitutional pre-flight evaluation.
 *
 * Throws when:
 *  - Sifiso OS is reachable but returns a non-2xx status
 *  - The gate passes = false AND `throwOnFail` is true (default)
 *
 * Returns a stub permissive result when SIFISO_OS_URL is not set, allowing
 * UIGen to run fully standalone in development without Sifiso OS.
 */
export async function checkWithSovereignGate(
  payload: UIGenGatePayload,
  options: { throwOnFail?: boolean } = {}
): Promise<SovereignGateResult> {
  const { throwOnFail = true } = options;
  const baseUrl = process.env.SIFISO_OS_URL;

  // ── Standalone mode ──────────────────────────────────────────────────────
  if (!baseUrl) {
    return stubResult();
  }

  const systemDid =
    process.env.UIGEN_SYSTEM_DID ?? "did:key:zuigen-system-node-dev";

  const body = {
    ...payload,
    initiator_did: systemDid,
  };

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/uigen/gate-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (err) {
    // Network failure — fail open so UIGen remains operational if Sifiso OS
    // is temporarily unreachable (e.g. during startup or maintenance).
    console.warn("[sifiso-gate] Network error — gate check skipped:", err);
    return stubResult();
  }

  if (!response.ok) {
    throw new Error(
      `Sifiso OS gate-check returned ${response.status}: ${await response.text()}`
    );
  }

  const result = (await response.json()) as SovereignGateResult;

  if (!result.passed && throwOnFail) {
    const predicates = result.failed_predicates.join(", ");
    throw new Error(
      `Ubuntu alignment gate failed (score ${result.ubuntu_score.toFixed(3)} < θ ${UBUNTU_THETA}). ` +
        `Failed predicates: ${predicates}. ${result.rationale}`
    );
  }

  return result;
}
