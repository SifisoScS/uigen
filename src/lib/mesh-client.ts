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
