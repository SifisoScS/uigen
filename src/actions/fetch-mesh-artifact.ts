"use server";

import { getSession } from "@/lib/auth";
import { buildLineageGraph, type LineageGraph } from "@/lib/lineage-graph";
import { fetchMeshArtifact, fetchMeshLineage, type MeshArtifactResponse } from "@/lib/mesh-client";
import { prisma } from "@/lib/prisma";

export interface FetchMeshArtifactResult {
  repoId: string;
  repoName: string;
  nodeId: string | null;
  response: MeshArtifactResponse;
  lineageGraph: LineageGraph;
  fetchedAt: Date;
}

/**
 * Fetch a Forge artifact and its cross-node lineage from a registered external
 * Mesh node (§14 Artifact Exchange + §15 Cross-Node Lineage Sync).
 *
 * Validates:
 * - Authenticated session
 * - Registered ExternalRepo exists
 * - Remote returns a non-empty signature
 *
 * Lineage fetch is best-effort — a lineage error returns an empty graph rather
 * than failing the entire action, since lineage may not yet exist on the remote.
 *
 * No local write occurs — use linkExternalArtifact to persist a cross-repo relation.
 */
export async function fetchMeshArtifactAction(
  externalRepoId: string,
  artifactId: string
): Promise<FetchMeshArtifactResult> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const repo = await prisma.externalRepo.findUnique({
    where: { id: externalRepoId },
    select: { id: true, name: true, url: true, nodeId: true },
  });
  if (!repo) throw new Error("ExternalRepo not found");

  let response: MeshArtifactResponse;
  try {
    response = await fetchMeshArtifact(repo.url, artifactId, AbortSignal.timeout(10_000));
  } catch (err) {
    throw new Error(`Mesh artifact fetch failed: ${String(err)}`);
  }

  if (!response.signature) {
    throw new Error("Missing signature on Mesh artifact response");
  }

  // §15 — fetch lineage; best-effort, empty graph on failure
  let lineageGraph: LineageGraph;
  try {
    const hops = await fetchMeshLineage(repo.url, artifactId, AbortSignal.timeout(5_000));
    lineageGraph = buildLineageGraph(artifactId, hops);
  } catch {
    lineageGraph = buildLineageGraph(artifactId, []);
  }

  return {
    repoId: repo.id,
    repoName: repo.name,
    nodeId: repo.nodeId,
    response,
    lineageGraph,
    fetchedAt: new Date(),
  };
}
