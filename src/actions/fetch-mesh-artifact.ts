"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchMeshArtifact, type MeshArtifactResponse } from "@/lib/mesh-client";

export interface FetchMeshArtifactResult {
  repoId: string;
  repoName: string;
  nodeId: string | null;
  response: MeshArtifactResponse;
  fetchedAt: Date;
}

/**
 * Fetch a Forge artifact from a registered external Mesh node via
 * GET {repo.url}/mesh/artifact/{artifactId} (§14 Artifact Exchange Protocol).
 *
 * Validates:
 * - Authenticated session
 * - Registered ExternalRepo exists
 * - Remote returns a non-empty signature
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

  // Phase 41: signature presence validation (real Ed25519 in Phase 42)
  if (!response.signature) {
    throw new Error("Missing signature on Mesh artifact response");
  }

  return {
    repoId: repo.id,
    repoName: repo.name,
    nodeId: repo.nodeId,
    response,
    fetchedAt: new Date(),
  };
}
