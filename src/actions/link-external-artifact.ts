"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface LinkExternalArtifactInput {
  /** Local artifact that is derived from / related to the external one. */
  localArtifactId: string;
  /** The registered ExternalRepo id. */
  externalRepoId: string;
  /** Absolute URL to the artifact in the remote registry (e.g. https://remote/api/registry/art-123). */
  externalArtifactUrl: string;
  /**
   * Semantic relation type.
   * Common values: "FORKED_FROM_EXTERNAL" | "SYNCED_FROM" | "INSPIRED_BY"
   */
  relationType: string;
}

export interface LinkExternalArtifactResult {
  relationId: string;
  alreadyLinked: boolean;
}

/**
 * Create an ArtifactRelation that records a cross-repo ancestry link.
 *
 * Parent  = the external artifact (represented by externalRepoId + externalArtifactUrl).
 * Child   = the local PublicArtifact.
 *
 * Idempotent: if the exact (parentId, childId) pair already exists the existing
 * relation is returned.
 */
export async function linkExternalArtifact(
  input: LinkExternalArtifactInput
): Promise<LinkExternalArtifactResult> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const { localArtifactId, externalRepoId, externalArtifactUrl, relationType } = input;

  // Verify local artifact exists
  const artifact = await prisma.publicArtifact.findUnique({
    where: { id: localArtifactId },
    select: { id: true },
  });
  if (!artifact) throw new Error("Local artifact not found");

  // Verify repo exists
  const repo = await prisma.externalRepo.findUnique({
    where: { id: externalRepoId },
    select: { id: true },
  });
  if (!repo) throw new Error("ExternalRepo not found");

  // Use externalArtifactUrl as the stable parentId for uniqueness
  const existing = await prisma.artifactRelation.findFirst({
    where: {
      parentType: "ExternalArtifact",
      parentId: externalArtifactUrl,
      childType: "PublicArtifact",
      childId: localArtifactId,
    },
  });

  if (existing) {
    return { relationId: existing.id, alreadyLinked: true };
  }

  const relation = await prisma.artifactRelation.create({
    data: {
      parentType: "ExternalArtifact",
      parentId: externalArtifactUrl,
      childType: "PublicArtifact",
      childId: localArtifactId,
      relationType,
      externalRepoId,
      externalArtifactUrl,
    },
  });

  // Log governance event
  await prisma.governanceEvent.create({
    data: {
      type: "EXTERNAL_ARTIFACT_LINKED",
      projectId: (await prisma.publicArtifact.findUnique({
        where: { id: localArtifactId },
        select: { projectId: true },
      }))!.projectId,
      actor: session.userId,
      details: {
        localArtifactId,
        externalRepoId,
        externalArtifactUrl,
        relationType,
      },
    },
  });

  return { relationId: relation.id, alreadyLinked: false };
}
