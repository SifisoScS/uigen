"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Create variant Projects from a user-selected subset of critique suggestions.
 *
 * Intended for use with multi-agent critique results: the caller provides the
 * artifact ID and the suggestions they want to materialise as variants.  Each
 * suggestion becomes one Project stub with a NEW_VARIANT_OF relation back to
 * the originating PublicArtifact and an ARTIFACT_VARIANT_CREATED governance
 * event.
 */
export async function generateSelectedVariants({
  artifactId,
  suggestions,
}: {
  artifactId: string;
  suggestions: Array<{ text: string; agentName: string }>;
}): Promise<{ variantIds: string[] }> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  if (!suggestions || suggestions.length === 0) {
    throw new Error("No suggestions provided");
  }

  // Verify artifact exists
  const artifact = await prisma.publicArtifact.findUnique({
    where: { id: artifactId },
    select: { id: true, projectId: true, name: true, filesData: true },
  });
  if (!artifact) throw new Error("Artifact not found");

  const variantIds: string[] = [];

  for (const { text, agentName } of suggestions) {
    // Create a Project stub seeded with the original artifact's files
    const variant = await prisma.project.create({
      data: {
        name: `${artifact.name} — ${text.slice(0, 50)}`,
        data: artifact.filesData,
      },
    });

    // Link variant back to the original artifact
    await prisma.artifactRelation.create({
      data: {
        parentType: "PublicArtifact",
        parentId: artifactId,
        childType: "Project",
        childId: variant.id,
        relationType: "NEW_VARIANT_OF",
      },
    });

    // Governance event
    await prisma.governanceEvent.create({
      data: {
        projectId: artifact.projectId,
        type: "ARTIFACT_VARIANT_CREATED",
        actor: agentName.toLowerCase(),
        details: {
          parentId: artifactId,
          childId: variant.id,
          suggestion: text,
          agentName,
        },
      },
    });

    variantIds.push(variant.id);
  }

  return { variantIds };
}
