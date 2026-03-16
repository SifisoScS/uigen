/**
 * The Forge — UIGen Client
 * ========================
 * Typed HTTP client for the Forge service (sifiso-os backend/forge/).
 * Handles blueprint validation and build submission for the construction layer.
 *
 * Environment variables:
 *   FORGE_URL   Base URL of the running Forge API (e.g. http://localhost:8001).
 *               When absent, all calls fail-open with stub responses so UIGen
 *               can run standalone during development without The Forge.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Blueprint {
  blueprint_id: string;
  artifact_type: string;
  name: string;
  description?: string;
  components: string[];
  files_hash?: string;
  semantic_summary?: string;
  requested_by: string; // DID
}

export interface BuildGrant {
  grant_id: string;     // = gate log_entry_id (SHA-256 hex)
  approved_by: string;  // = UIGEN_SYSTEM_DID
  signature: string;    // Phase 31 stub: "FORGE_DID:stub"
  ubuntu_score: number;
}

export interface BuildRequest {
  blueprint: Blueprint;
  grant: BuildGrant;
}

export interface BuildStatus {
  build_id: string;
  blueprint_id: string;
  grant_id: string;
  state: "ACCEPTED" | "COMPLETE" | "FAILED";
  message: string;
  submitted_at: string; // ISO-8601
}

export interface BuildArtifact {
  build_id: string;
  blueprint_id: string;
  state: string;
  merkle_root: string;
  manifest: ArtifactManifest;
}

export interface ArtifactManifest {
  blueprint_id: string;
  artifact_type: string;
  name: string;
  files: FileEntry[];
  merkle_root: string;
  built_at: string;
}

export interface FileEntry {
  path: string;
  content_hash: string;
  size_bytes: number;
}

export interface ValidateBlueprintResponse {
  valid: boolean;
  blueprint_id: string;
  message: string;
}

// ── Stub helpers ──────────────────────────────────────────────────────────────

function stubValidate(blueprint: Blueprint): ValidateBlueprintResponse {
  return {
    valid: true,
    blueprint_id: blueprint.blueprint_id,
    message: "Blueprint accepted (Forge stub — FORGE_URL not configured).",
  };
}

function stubBuild(req: BuildRequest): BuildStatus {
  return {
    build_id: `stub-build-${Date.now()}`,
    blueprint_id: req.blueprint.blueprint_id,
    grant_id: req.grant.grant_id,
    state: "COMPLETE",
    message: "Build completed (Forge stub — FORGE_URL not configured).",
    submitted_at: new Date().toISOString(),
  };
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function normalise(url: string): string {
  return url.replace(/\/+$/, "");
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const base = process.env.FORGE_URL;
  if (!base) throw new Error("FORGE_URL not configured");
  const res = await fetch(`${normalise(base)}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Forge ${path} → HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const base = process.env.FORGE_URL;
  if (!base) throw new Error("FORGE_URL not configured");
  const res = await fetch(`${normalise(base)}${path}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Forge ${path} → HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validate a blueprint against Forge acceptance criteria.
 * Fails open with a stub response when FORGE_URL is not set.
 */
export async function forgeValidateBlueprint(
  blueprint: Blueprint
): Promise<ValidateBlueprintResponse> {
  if (!process.env.FORGE_URL) {
    return stubValidate(blueprint);
  }
  return post<ValidateBlueprintResponse>("/forge/blueprint", blueprint);
}

/**
 * Submit a build request to The Forge.
 * Requires a valid BuildGrant from the Sovereign Gate.
 * Fails open with a stub response when FORGE_URL is not set.
 */
export async function forgeSubmitBuild(req: BuildRequest): Promise<BuildStatus> {
  if (!process.env.FORGE_URL) {
    return stubBuild(req);
  }
  return post<BuildStatus>("/forge/build", req);
}

/**
 * Poll the status of an in-flight or completed build.
 */
export async function forgeBuildStatus(buildId: string): Promise<BuildStatus> {
  return get<BuildStatus>(`/forge/build/${encodeURIComponent(buildId)}/status`);
}

/**
 * Retrieve the built artifact for a completed build.
 */
export async function forgeBuildArtifact(buildId: string): Promise<BuildArtifact> {
  return get<BuildArtifact>(`/forge/build/${encodeURIComponent(buildId)}/artifact`);
}
