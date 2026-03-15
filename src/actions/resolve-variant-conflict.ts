"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyResolutions, buildNestedFS, type Resolution } from "@/lib/virtual-fs-utils";

/**
 * Apply per-file conflict resolutions and complete the variant merge.
 *
 * Each resolution specifies whether to keep the "original" or take the
 * "variant" version of a conflicting file. Non-conflicting files follow the
 * default merge strategy (variant additions are included; identical files are
 * kept; original-only files are preserved).
 *
 * On success, the original project's `data` field is updated with the merged
 * file system and `mergedFromVariantId`, `mergedAt`, and `conflictResolvedAt`
 * are stamped. An ARTIFACT_VARIANT_CONFLICT_RESOLVED governance event is logged.
 */
export async function resolveVariantConflict({
  originalArtifactId,
  variantProjectId,
  resolutions,
}: {
  originalArtifactId: string;
  variantProjectId: string;
  resolutions: Resolution[];
}): Promise<{ mergedAt: Date; conflictResolvedAt: Date }> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  // 1. Verify link
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
    select: { id: true, status: true, data: true },
  });
  if (!variant) throw new Error("Variant project not found");
  if (variant.status !== "APPROVED") throw new Error("Variant must be APPROVED before merging");

  // 3. Resolve the artifact
  const artifact = await prisma.publicArtifact.findUnique({
    where: { id: originalArtifactId },
    select: { id: true, projectId: true },
  });
  if (!artifact) throw new Error("Artifact not found");

  // 4. Fetch original project data
  const originalProject = await prisma.project.findUnique({
    where: { id: artifact.projectId },
    select: { id: true, data: true },
  });
  if (!originalProject) throw new Error("Original project not found");

  // 5. Apply resolutions → build merged file system
  const mergedFiles = applyResolutions(originalProject.data, variant.data, resolutions);
  const mergedTree = buildNestedFS(mergedFiles);
  const mergedData = JSON.stringify(mergedTree);

  const mergedAt = new Date();
  const conflictResolvedAt = mergedAt;

  // 6. Update original project
  await prisma.project.update({
    where: { id: artifact.projectId },
    data: {
      data: mergedData,
      mergedFromVariantId: variantProjectId,
      mergedAt,
      conflictResolvedAt,
    },
  });

  // 7. Log governance event
  await prisma.governanceEvent.create({
    data: {
      projectId: artifact.projectId,
      type: "ARTIFACT_VARIANT_CONFLICT_RESOLVED",
      actor: session.userId,
      details: {
        variantProjectId,
        originalArtifactId,
        originalProjectId: artifact.projectId,
        resolutionCount: resolutions.length,
        resolutions: resolutions.map((r) => ({ path: r.path, choice: r.choice })),
      },
    },
  });

  return { mergedAt, conflictResolvedAt };
}
