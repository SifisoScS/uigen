"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { detectConflicts, type ConflictingFile } from "@/lib/virtual-fs-utils";
import { writePresenceObservation } from "@/lib/pkl-bridge";

export type MergeResult =
  | { type: "ok"; mergedAt: Date }
  | { type: "conflict"; conflictingFiles: ConflictingFile[] };

/**
 * Merge an approved variant Project back into the original artifact's project.
 *
 * 1. If the variant's files conflict with the original project's files, returns
 *    `{ type: "conflict", conflictingFiles }` and logs
 *    ARTIFACT_VARIANT_CONFLICT_DETECTED — no merge is applied yet.
 * 2. If there are no conflicts, applies the merge immediately and returns
 *    `{ type: "ok", mergedAt }`.
 *
 * Only APPROVED variants may be merged. Requires an authenticated session.
 */
export async function mergeVariant({
  originalArtifactId,
  variantProjectId,
}: {
  originalArtifactId: string;
  variantProjectId: string;
}): Promise<MergeResult> {
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
    select: { id: true, status: true, data: true },
  });
  if (!variant) throw new Error("Variant project not found");
  if (variant.status !== "APPROVED") throw new Error("Variant must be APPROVED before merging");

  // 3. Resolve the original artifact's project
  const artifact = await prisma.publicArtifact.findUnique({
    where: { id: originalArtifactId },
    select: { id: true, projectId: true },
  });
  if (!artifact) throw new Error("Artifact not found");

  // 4. Fetch original project data for conflict detection
  const originalProject = await prisma.project.findUnique({
    where: { id: artifact.projectId },
    select: { id: true, data: true },
  });
  if (!originalProject) throw new Error("Original project not found");

  // 5. Detect file-level conflicts
  const conflictingFiles = detectConflicts(originalProject.data, variant.data);

  if (conflictingFiles.length > 0) {
    // Log conflict detection governance event — no merge applied yet
    await prisma.governanceEvent.create({
      data: {
        projectId: artifact.projectId,
        type: "ARTIFACT_VARIANT_CONFLICT_DETECTED",
        actor: session.userId,
        details: {
          variantProjectId,
          originalArtifactId,
          conflictCount: conflictingFiles.length,
          conflictingPaths: conflictingFiles.map((f) => f.path),
        },
      },
    });

    return { type: "conflict", conflictingFiles };
  }

  // 6. No conflicts — record the merge on the original project
  const mergedAt = new Date();
  await prisma.project.update({
    where: { id: artifact.projectId },
    data: {
      mergedFromVariantId: variantProjectId,
      mergedAt,
    },
  });

  // 7. Log governance event
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

  // PKL memory write — fail-open
  await writePresenceObservation({
    key: `uigen:variant_merged:${variantProjectId}`,
    value: {
      event_type: "variant_merged",
      artifact_id: originalArtifactId,
      variant_id: variantProjectId,
      resolved_conflicts: false,
      timestamp: Date.now(),
    },
    category: "uigen",
  });

  return { type: "ok", mergedAt };
}
