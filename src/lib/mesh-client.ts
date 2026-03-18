/**
 * Typed Mesh client for the Artifact Exchange Protocol (§14)
 * and Cross-Node Lineage Sync (§15).
 *
 * Fetches artifacts from remote Sifiso OS / UIGen Mesh nodes via:
 *   GET {baseUrl}/mesh/artifact/{artifactId}
 *   GET {baseUrl}/mesh/lineage/{artifactId}
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
