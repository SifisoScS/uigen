"use server";

import { getSession } from "@/lib/auth";
import { buildLineageGraph, type LineageGraph } from "@/lib/lineage-graph";
import {
  fetchMeshArtifact,
  fetchMeshArtifactTrust,
  fetchMeshLineage,
  fetchMeshNodeTrust,
  type MeshArtifactResponse,
} from "@/lib/mesh-client";
import { prisma } from "@/lib/prisma";
import { combineTrustSignals, type EffectiveTrust } from "@/lib/trust-signals";

export interface FetchMeshArtifactResult {
  repoId: string;
  repoName: string;
  nodeId: string | null;
  response: MeshArtifactResponse;
  lineageGraph: LineageGraph;
  trust: EffectiveTrust | null;
  fetchedAt: Date;
}

/**
 * Fetch a Forge artifact, its cross-node lineage, and trust signals from a
 * registered external Mesh node (§14 Artifact Exchange + §15 Lineage Sync
 * + §16 Trust & Reputation Export).
 *
 * Validates:
 * - Authenticated session
 * - Registered ExternalRepo exists
 * - Remote returns a non-empty signature
 *
 * Lineage and trust fetches are best-effort — errors return an empty graph /
 * null trust rather than failing the entire action (§16.4 Rule 5: Non-Binding).
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

  // §16 — fetch trust signals; best-effort, null on any failure (§16.4 Rule 5)
  let trust: EffectiveTrust | null = null;
  try {
    const signal = AbortSignal.timeout(5_000);
    const nodeTrust = await fetchMeshNodeTrust(repo.url, signal);
    const artifactTrust = await fetchMeshArtifactTrust(repo.url, artifactId, signal).catch(
      () => null
    );
    trust = combineTrustSignals(nodeTrust, artifactTrust);
  } catch {
    // network failure or gate denial — trust stays null
  }

  return {
    repoId: repo.id,
    repoName: repo.name,
    nodeId: repo.nodeId,
    response,
    lineageGraph,
    trust,
    fetchedAt: new Date(),
  };
}
