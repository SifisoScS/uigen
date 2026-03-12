"use server";

import { prisma } from "@/lib/prisma";

export interface ArtifactSummary {
  id: string;
  name: string;
  version: string;
  authorId: string | null;
  createdAt: Date;
}

export interface ArtifactLineage {
  parent: ArtifactSummary | null;
  children: ArtifactSummary[];
}

const SELECT = {
  id: true,
  name: true,
  version: true,
  authorId: true,
  createdAt: true,
} as const;

/**
 * Shallow (1-level) lineage: returns the parent artifact (if this was
 * remixed from one) and all direct children (artifacts remixed from this one).
 */
export async function getArtifactLineage(
  artifactId: string
): Promise<ArtifactLineage> {
  const artifact = await prisma.publicArtifact.findUnique({
    where: { id: artifactId },
    select: { parentArtifactId: true },
  });
  if (!artifact) throw new Error("Artifact not found");

  const [parent, children] = await Promise.all([
    artifact.parentArtifactId
      ? prisma.publicArtifact.findUnique({
          where: { id: artifact.parentArtifactId },
          select: SELECT,
        })
      : Promise.resolve(null),
    prisma.publicArtifact.findMany({
      where: { parentArtifactId: artifactId },
      orderBy: { createdAt: "desc" },
      select: SELECT,
    }),
  ]);

  return { parent: parent ?? null, children };
}
