"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { kMeans, type ClusterResult } from "@/lib/embeddings";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ArtifactCluster {
  clusterId: number;
  memberCount: number;
  artifactIds: string[];
  centroid: number[];
}

export interface ClusterArtifactsResult {
  k: number;
  totalArtifacts: number;
  clusters: ArtifactCluster[];
}

// ── Action ────────────────────────────────────────────────────────────────────

/**
 * Group all artifacts with stored embeddings into `k` clusters using
 * Lloyd's k-means algorithm (cosine distance).
 *
 * Returns cluster assignments and centroids.  Useful for surfacing
 * "artifact categories" in the registry UI or for routing critiques.
 */
export async function clusterArtifacts({
  k = 3,
}: {
  k?: number;
}): Promise<ClusterArtifactsResult> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const embeddings = await prisma.artifactEmbedding.findMany({
    select: { artifactId: true, vector: true },
  });

  if (embeddings.length === 0) {
    return { k, totalArtifacts: 0, clusters: [] };
  }

  const clampedK = Math.min(k, embeddings.length);
  const points = embeddings.map((e) => ({ id: e.artifactId, vector: e.vector }));

  const raw: ClusterResult[] = kMeans(points, clampedK);

  const clusters: ArtifactCluster[] = raw.map((c) => ({
    clusterId: c.clusterId,
    memberCount: c.members.length,
    artifactIds: c.members,
    centroid: c.centroid,
  }));

  return { k: clampedK, totalArtifacts: embeddings.length, clusters };
}
