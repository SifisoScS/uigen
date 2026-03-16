/**
 * iKhaya AI client for UIGen
 *
 * Typed HTTP client for the Sifiso OS /api/ikhaya/ surface.
 * Fails open when SIFISO_OS_URL is not configured (development mode).
 */

export interface NarrateRequest {
  artifact_id: string;
  variant_id?: string;
  ubuntu_score: number;
  gate_log_entry_id: string;
  semantic_delta?: {
    a11yDelta?: number;
    linesChanged?: number;
    addedComponents?: string[];
    removedComponents?: string[];
  };
  agent_did?: string;
}

export interface NarrateResponse {
  narrative: string;
  confidence: number;
  tone: "affirming" | "cautionary" | "warning" | "bypassed";
  references: string[];
}

export interface InterpretLineageRequest {
  artifact_id: string;
  from_version?: string;
  to_version?: string;
  lineage_graph?: object[];
  semantic_transforms?: object[];
}

export interface InterpretLineageResponse {
  summary: string;
  change_list: string[];
  reasoning_narrative: string;
  ubuntu_alignment_notes: string;
}

export interface MANCEAgent {
  did: string;
  name?: string;
}

export interface MANCEDeliberateRequest {
  agents: MANCEAgent[];
  prompt: string;
  context?: object;
}

export interface MANCEDeliberateResponse {
  deliberation_transcript: { agent: string; statement: string }[];
  consensus_summary: string;
  dissenting_views: string[];
  recommended_action: string;
}

const BYPASSED_LOG_ID = "0".repeat(64);

// ── Fallback stubs (offline / development mode) ───────────────────────────────

function stubNarrate(req: NarrateRequest): NarrateResponse {
  const bypassed = req.gate_log_entry_id === BYPASSED_LOG_ID;
  if (bypassed) {
    return {
      narrative:
        `This action concerning artifact '${req.artifact_id}' proceeded without council review. ` +
        "The Sovereign Gate is not configured in this environment (development mode). " +
        "In a sovereign deployment, every action passes through the council before taking effect.",
      confidence: 0.5,
      tone: "bypassed",
      references: [],
    };
  }
  const pct = Math.round(req.ubuntu_score * 100);
  const tone: NarrateResponse["tone"] =
    req.ubuntu_score >= 0.75 ? "affirming" :
    req.ubuntu_score >= 0.65 ? "cautionary" : "warning";
  return {
    narrative:
      tone === "affirming"
        ? `The council affirmed this action with Ubuntu alignment ${pct}/100. ` +
          `Artifact '${req.artifact_id}' was recognised as strengthening the community's shared values.`
        : tone === "cautionary"
        ? `The council approved artifact '${req.artifact_id}' with Ubuntu alignment ${pct}/100, at the threshold of shared integrity.`
        : `The council held on artifact '${req.artifact_id}'. Ubuntu alignment (${pct}/100) fell below the constitutional threshold.`,
    confidence: Math.min(1, req.ubuntu_score + 0.1),
    tone,
    references: [],
  };
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function normalise(url: string): string {
  return url.replace(/\/+$/, "");
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const base = process.env.SIFISO_OS_URL;
  if (!base) throw new Error("SIFISO_OS_URL not configured");
  const res = await fetch(`${normalise(base)}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`iKhaya ${path} → HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Request a Ubuntu-grounded narrative for a gate decision.
 * Falls back to a template-based stub when Sifiso OS is unreachable.
 */
export async function ikhayaNarrate(req: NarrateRequest): Promise<NarrateResponse> {
  try {
    return await post<NarrateResponse>("/api/ikhaya/narrate", req);
  } catch {
    return stubNarrate(req);
  }
}

/**
 * Request a lineage interpretation for an artifact's evolution.
 * Falls back gracefully when Sifiso OS is unreachable.
 */
export async function ikhayaInterpretLineage(
  req: InterpretLineageRequest
): Promise<InterpretLineageResponse> {
  try {
    return await post<InterpretLineageResponse>("/api/ikhaya/interpret-lineage", req);
  } catch {
    const gen = req.lineage_graph?.length ?? 0;
    return {
      summary: `Artifact '${req.artifact_id}' has evolved through ${gen} generation(s).`,
      change_list: [],
      reasoning_narrative:
        `Across ${gen} generation(s), the artifact reflects the community's evolving understanding.`,
      ubuntu_alignment_notes:
        "Accessibility baseline was maintained (development mode — Sifiso OS not configured).",
    };
  }
}

/**
 * Request a MANCE council deliberation.
 * Falls back gracefully when Sifiso OS is unreachable.
 */
export async function ikhayaMANCEDeliberate(
  req: MANCEDeliberateRequest
): Promise<MANCEDeliberateResponse> {
  try {
    return await post<MANCEDeliberateResponse>("/api/ikhaya/mance-deliberate", req);
  } catch {
    return {
      deliberation_transcript: req.agents.map((a) => ({
        agent: a.name ?? a.did.slice(0, 12) + "…",
        statement: "The council speaks in development mode — Sifiso OS is not configured.",
      })),
      consensus_summary: "Deliberation unavailable (Sifiso OS not configured).",
      dissenting_views: [],
      recommended_action: "Proceed with awareness.",
    };
  }
}
