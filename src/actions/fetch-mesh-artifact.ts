"use server";

import { getSession } from "@/lib/auth";
import { verifyEd25519 } from "@/lib/ed25519";
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
    select: { id: true, name: true, url: true, nodeId: true, publicKey: true },
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

  // §17.5 Rule 4 — verify artifact signature when publicKey is available
  if (repo.publicKey) {
    const canonical = `${artifactId}:${response.summary.content_hash}`;
    const valid = verifyEd25519(response.signature, canonical, repo.publicKey);
    if (!valid) throw new Error("Artifact signature verification failed");
  }

  // §15 — fetch lineage; best-effort, empty graph on failure
  let lineageGraph: LineageGraph;
  let hops: Awaited<ReturnType<typeof fetchMeshLineage>> = [];
  try {
    hops = await fetchMeshLineage(repo.url, artifactId, AbortSignal.timeout(5_000));
    // §17.5 Rule 4 — verify each hop signature (best-effort: wrong sig = hard fail)
    if (repo.publicKey) {
      for (const hop of hops) {
        const canonical = `${hop.node_did}:${hop.mesh_id}:${hop.timestamp}`;
        if (hop.signature && !verifyEd25519(hop.signature, canonical, repo.publicKey)) {
          throw new Error(`Lineage hop signature invalid for node ${hop.node_did}`);
        }
      }
    }
    lineageGraph = buildLineageGraph(artifactId, hops);
  } catch (err) {
    if (String(err).includes("signature")) throw err;   // re-throw verification failures
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
