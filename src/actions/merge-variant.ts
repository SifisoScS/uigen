"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Merge an approved variant Project back into the original artifact's project.
 *
 * Only APPROVED variants may be merged. Requires an authenticated session
 * (human actor). Records the merge on the original project and logs a
 * ARTIFACT_VARIANT_MERGED governance event.
 */
export async function mergeVariant({
  originalArtifactId,
  variantProjectId,
}: {
  originalArtifactId: string;
  variantProjectId: string;
}): Promise<{ mergedAt: Date }> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  // 1. Verify the variant is linked to the original artifact via NEW_VARIANT_OF
  const relation = await prisma.artifactRelation.findFirst({
    where: {
      parentType: "PublicArtifact",
      parentId: originalArtifactId,
      childType: "Project",
      childId: variantProjectId,
      relationType: "NEW_VARIANT_OF",
    },
  });
  if (!relation) throw new Error("Variant is not linked to this artifact");

  // 2. Verify variant is APPROVED
  const variant = await prisma.project.findUnique({
    where: { id: variantProjectId },
    select: { id: true, status: true },
  });
  if (!variant) throw new Error("Variant project not found");
  if (variant.status !== "APPROVED") throw new Error("Variant must be APPROVED before merging");

  // 3. Resolve the original artifact's project
  const artifact = await prisma.publicArtifact.findUnique({
    where: { id: originalArtifactId },
    select: { id: true, projectId: true },
  });
  if (!artifact) throw new Error("Artifact not found");

  // 4. Record the merge on the original project
  const mergedAt = new Date();
  await prisma.project.update({
    where: { id: artifact.projectId },
    data: {
      mergedFromVariantId: variantProjectId,
      mergedAt,
    },
  });

  // 5. Log governance event
  await prisma.governanceEvent.create({
    data: {
      projectId: artifact.projectId,
      type: "ARTIFACT_VARIANT_MERGED",
      actor: session.userId,
      details: {
        variantProjectId,
        originalArtifactId,
        originalProjectId: artifact.projectId,
      },
    },
  });

  return { mergedAt };
}
