/**
 * Typed Mesh client for the Artifact Exchange Protocol (§14),
 * Cross-Node Lineage Sync (§15), and Trust & Reputation Export (§16).
 *
 * Fetches artifacts from remote Sifiso OS / UIGen Mesh nodes via:
 *   GET {baseUrl}/mesh/artifact/{artifactId}
 *   GET {baseUrl}/mesh/lineage/{artifactId}
 *   GET {baseUrl}/mesh/trust/node
 *   GET {baseUrl}/mesh/trust/artifact/{artifactId}
 */

/** §15.1 — A single node's touch record in a cross-node artifact lineage. */
export interface LineageHop {
  node_did: string;
  mesh_id: string;
  timestamp: number;
  signature: string;   // §17 — Ed25519 hex (128 chars); empty string if not yet signed
}

// ── §18 — Multi-Node MANCE & Distributed Forge types ─────────────────────────

/** §18.2 — A signed cross-node MANCE proposal. */
export interface ManceProposal {
  proposal_id: string;
  origin_node_did: string;
  artifact_id: string;
  lineage_hops: LineageHop[];
  trust: {
    node_ubuntu: number;
    artifact_confidence: number | null;
    label: string;
  };
  timestamp: number;
  signature: string;   // Ed25519 hex (128 chars)
}

/** §18.3/§22.5 — A signed vote on a ManceProposal with quorum result. */
export interface ManceVote {
  proposal_id: string;
  voter_node_did: string;
  vote: "approve" | "reject";
  reason: string;
  timestamp: number;
  signature: string;        // Ed25519 hex (128 chars)
  quorum_votes?: number;    // §22.5 — total votes (self + peer responses)
  quorum_passed?: boolean;  // §22.5 — whether ≥50% approved
}

/** §18.4 — A signed distributed Forge build task. */
export interface ForgeTask {
  task_id: string;
  proposal_id: string;
  assigned_node_did: string;
  artifact_id: string;
  timestamp: number;
  signature: string;   // Ed25519 hex (128 chars)
}

/** §18.5 — Peer node descriptor for ForgeTask assignment. */
export interface PeerNodeDescriptor {
  node_did: string;
  trust: {
    node_ubuntu: number;
    artifact_confidence?: number | null;
    label: string;
  };
}

// ── §19 — Distributed Critique types ─────────────────────────────────────────

/** §19.1 — A signed peer critique score for a ManceProposal artifact. */
export interface CritiqueScore {
  proposal_id: string;
  artifact_id: string;
  critic_node_did: string;
  score: number;           // 0.0–1.0
  comment: string;
  timestamp: number;
  signature: string;       // Ed25519 hex (128 chars)
}

/** §19.2 — Aggregate critique result for a proposal. */
export interface CritiqueAggregate {
  proposal_id: string;
  average_score: number;
  count: number;
}

// ── §20 — Remote Forge Execution types ───────────────────────────────────────

/** §20.1 — A signed receipt from a remote Forge build execution. */
export interface BuildReceipt {
  task_id: string;
  artifact_id: string;
  runner_node_did: string;
  status: "success" | "failure";
  logs_hash: string;       // SHA-256 hex (64 chars) — never raw logs
  timestamp: number;
  signature: string;       // Ed25519 hex (128 chars)
}

// ── §21 — Mesh Orchestration types ───────────────────────────────────────────

/** §21.1 — Scheduling policy for orchestration decisions. */
export interface OrchestrationPolicy {
  min_ubuntu_score: number;
  max_peers: number;
  retry_on_failure: boolean;
  prefer_local_node: boolean;
  timestamp: number;
}

/** §21.2 — A signed, policy-visible orchestration decision. */
export interface OrchestrationDecision {
  artifact_id: string;
  candidate_nodes: string[];   // ordered by ubuntu_score desc, DID tiebreaker
  policy: OrchestrationPolicy;
  timestamp: number;
  signature: string;           // Ed25519 hex (128 chars)
}

// ── §22 — Peer Registry types & client functions ──────────────────────────────

/** §22.1 — A registered Mesh peer node. */
export interface PeerNode {
  node_did: string;
  url: string;
  public_key: string;   // Ed25519 hex (64 chars)
  registered_at: number;
}

/**
 * Register a peer node with a remote Sifiso OS instance (§22.2).
 *
 * @param baseUrl   - Remote Sifiso OS URL
 * @param peer      - Peer identity to register
 * @param signal    - Optional AbortSignal
 */
export async function registerMeshPeer(
  baseUrl: string,
  peer: { node_did: string; url: string; public_key: string },
  signal?: AbortSignal
): Promise<PeerNode> {
  const url = `${baseUrl.replace(/\/+$/, "")}/mesh/peers/register`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(peer),
    signal,
  });
  if (!res.ok) throw new Error(`Peer registration failed: ${res.status} from ${url}`);
  return (await res.json()) as PeerNode;
}

/**
 * List all registered peer nodes from a remote Sifiso OS instance (§22.2).
 *
 * @param baseUrl   - Remote Sifiso OS URL
 * @param signal    - Optional AbortSignal
 */
export async function listMeshPeers(
  baseUrl: string,
  signal?: AbortSignal
): Promise<PeerNode[]> {
  const url = `${baseUrl.replace(/\/+$/, "")}/mesh/peers`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`List peers failed: ${res.status} from ${url}`);
  return (await res.json()) as PeerNode[];
}

/** §17 — Handshake response type (used by register-external-repo). */
export interface MeshHandshakeResponse {
  accepted: boolean;
  reason?: string;
  my_node_info?: {
    node_did: string;
    public_key: string;
    timestamp: number;
    [key: string]: unknown;
  };
  node_signature?: string;   // §17 — Ed25519 hex of "{node_did}:{timestamp}"
}

export interface ArtifactSummary {
  artifact_id: string;
  origin_node_did: string;
  lineage_hops: LineageHop[];   // §15.2 — full LineageHop objects, origin first
  content_hash: string;
  content_mime: string;
  gate_log_merkle: string;
  timestamp: number;
}

export interface MeshArtifactResponse {
  summary: ArtifactSummary;
  content: string;
  signature: string;
}

/**
 * Fetch a Forge artifact from a remote Mesh node.
 *
 * @param baseUrl - The registered remote node URL (trailing slash stripped)
 * @param artifactId - The mesh_id / artifact_id to fetch
 * @param signal - Optional AbortSignal for timeout / cancellation
 * @throws Error on non-2xx response or network failure
 */
export async function fetchMeshArtifact(
  baseUrl: string,
  artifactId: string,
  signal?: AbortSignal
): Promise<MeshArtifactResponse> {
  const url = `${baseUrl.replace(/\/+$/, "")}/mesh/artifact/${encodeURIComponent(artifactId)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });

  if (!res.ok) {
    throw new Error(`Mesh artifact fetch failed: ${res.status} from ${url}`);
  }

  return (await res.json()) as MeshArtifactResponse;
}

/** §16.1 — Node-level trust summary derived from GateLog. */
export interface NodeTrustSummary {
  node_did: string;
  ubuntu_score: number;
  gate_events_total: number;
  last_updated: number;
  mesh_version: string;
}

/** §16.2 — Per-artifact trust advisory issued by the serving node. */
export interface ArtifactTrustHint {
  artifact_id: string;
  node_did: string;
  trust_label: string;   // "high" | "medium" | "low"
  confidence: number;
  last_updated: number;
}

/**
 * Fetch the node-level trust summary from a remote Mesh node.
 *
 * @param baseUrl - The registered remote node URL (trailing slash stripped)
 * @param signal  - Optional AbortSignal for timeout / cancellation
 * @throws Error on non-2xx response or network failure
 */
export async function fetchMeshNodeTrust(
  baseUrl: string,
  signal?: AbortSignal
): Promise<NodeTrustSummary> {
  const url = `${baseUrl.replace(/\/+$/, "")}/mesh/trust/node`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    throw new Error(`Mesh node trust fetch failed: ${res.status} from ${url}`);
  }
  return (await res.json()) as NodeTrustSummary;
}

/**
 * Fetch the per-artifact trust hint from a remote Mesh node.
 *
 * @param baseUrl    - The registered remote node URL (trailing slash stripped)
 * @param artifactId - The artifact to query trust for
 * @param signal     - Optional AbortSignal for timeout / cancellation
 * @throws Error on non-2xx response (including 404) or network failure
 */
export async function fetchMeshArtifactTrust(
  baseUrl: string,
  artifactId: string,
  signal?: AbortSignal
): Promise<ArtifactTrustHint> {
  const url = `${baseUrl.replace(/\/+$/, "")}/mesh/trust/artifact/${encodeURIComponent(artifactId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    throw new Error(`Mesh artifact trust fetch failed: ${res.status} from ${url}`);
  }
  return (await res.json()) as ArtifactTrustHint;
}

/**
 * Fetch the cross-node lineage hops for an artifact from a remote Mesh node.
 *
 * @param baseUrl - The registered remote node URL (trailing slash stripped)
 * @param artifactId - The mesh_id / artifact_id whose lineage to fetch
 * @param signal - Optional AbortSignal for timeout / cancellation
 * @throws Error on non-2xx response or network failure
 */
export async function fetchMeshLineage(
  baseUrl: string,
  artifactId: string,
  signal?: AbortSignal
): Promise<LineageHop[]> {
  const url = `${baseUrl.replace(/\/+$/, "")}/mesh/lineage/${encodeURIComponent(artifactId)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });

  if (!res.ok) {
    throw new Error(`Mesh lineage fetch failed: ${res.status} from ${url}`);
  }

  return (await res.json()) as LineageHop[];
}
