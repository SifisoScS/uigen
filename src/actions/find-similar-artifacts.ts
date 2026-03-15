"use server";

import { prisma } from "@/lib/prisma";
import { cosineSimilarity } from "@/lib/embeddings";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SimilarArtifact {
  artifactId: string;
  name: string;
  version: string;
  similarity: number;
}

// ── Action ────────────────────────────────────────────────────────────────────

/**
 * Return the `topK` most similar artifacts to `artifactId` by cosine
 * similarity of their stored embeddings.
 *
 * Similarity search is in-memory (fetch all embeddings, compute JS cosine).
 * This is intentional for SQLite/Neon MVP scale. For production at scale,
 * replace with a pgvector `<=>` operator query or a vector DB call.
 *
 * Returns an empty array when the artifact has no embedding.
 */
export async function findSimilarArtifacts({
  artifactId,
  topK = 5,
}: {
  artifactId: string;
  topK?: number;
}): Promise<SimilarArtifact[]> {
  const target = await prisma.artifactEmbedding.findUnique({
    where: { artifactId },
    select: { vector: true },
  });

  if (!target) return [];

  // Fetch all other embeddings
  const others = await prisma.artifactEmbedding.findMany({
    where: { artifactId: { not: artifactId } },
    select: { artifactId: true, vector: true },
  });

  if (others.length === 0) return [];

  // Compute cosine similarity for each
  const scored = others
    .map((e) => ({
      artifactId: e.artifactId,
      similarity: cosineSimilarity(target.vector, e.vector),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  if (scored.length === 0) return [];

  // Fetch artifact metadata for the top K
  const artifactIds = scored.map((s) => s.artifactId);
  const artifacts = await prisma.publicArtifact.findMany({
    where: { id: { in: artifactIds } },
    select: { id: true, name: true, version: true },
  });

  const nameMap = new Map(artifacts.map((a) => [a.id, a]));

  return scored
    .filter((s) => nameMap.has(s.artifactId))
    .map((s) => ({
      artifactId: s.artifactId,
      name: nameMap.get(s.artifactId)!.name,
      version: nameMap.get(s.artifactId)!.version,
      similarity: parseFloat(s.similarity.toFixed(4)),
    }));
}
