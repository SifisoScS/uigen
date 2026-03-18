/**
 * Typed Mesh client for the Artifact Exchange Protocol (§14).
 *
 * Fetches artifacts from remote Sifiso OS / UIGen Mesh nodes via
 * GET {baseUrl}/mesh/artifact/{artifactId}.
 */

export interface ArtifactSummary {
  artifact_id: string;
  origin_node_did: string;
  lineage_hops: string[];
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
