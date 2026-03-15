"use server";

import { prisma } from "@/lib/prisma";

export interface SemanticTransformResult {
  id: string;
  fromArtifactId: string;
  toArtifactId: string;
  addedComponents: string[];
  removedComponents: string[];
  modifiedProps: Record<string, string[]>;
  a11yDelta: number;
  linesChanged: number;
  createdAt: Date;
}

/**
 * Return the semantic transform trace recorded when `toArtifactId` was
 * published, or `null` if no trace exists (e.g. for v1.0.0 artifacts that
 * were published directly, not promoted from a variant).
 */
export async function getSemanticTransform(
  toArtifactId: string
): Promise<SemanticTransformResult | null> {
  const row = await prisma.semanticTransform.findUnique({
    where: { toArtifactId },
  });
  if (!row) return null;

  return {
    id: row.id,
    fromArtifactId: row.fromArtifactId,
    toArtifactId: row.toArtifactId,
    addedComponents: row.addedComponents,
    removedComponents: row.removedComponents,
    modifiedProps: row.modifiedProps as Record<string, string[]>,
    a11yDelta: row.a11yDelta,
    linesChanged: row.linesChanged,
    createdAt: row.createdAt,
  };
}

/**
 * Return all transforms where `fromArtifactId` matches — i.e. every
 * generation that was published directly from this artifact.
 */
export async function getSemanticTransformsBySource(
  fromArtifactId: string
): Promise<SemanticTransformResult[]> {
  const rows = await prisma.semanticTransform.findMany({
    where: { fromArtifactId },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    fromArtifactId: row.fromArtifactId,
    toArtifactId: row.toArtifactId,
    addedComponents: row.addedComponents,
    removedComponents: row.removedComponents,
    modifiedProps: row.modifiedProps as Record<string, string[]>,
    a11yDelta: row.a11yDelta,
    linesChanged: row.linesChanged,
    createdAt: row.createdAt,
  }));
}
