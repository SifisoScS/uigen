"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type VariantStatus = "DRAFT" | "APPROVED" | "REJECTED";

/**
 * Approve or reject an auto-generated variant Project.
 *
 * Only human actors (authenticated sessions) can approve/reject.
 * The project must be a variant — verified by the presence of a
 * NEW_VARIANT_OF ArtifactRelation pointing to it.
 */
export async function approveVariant(
  projectId: string,
  approved = true
): Promise<{ status: VariantStatus }> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  // Verify the project is a variant (linked via NEW_VARIANT_OF)
  const relation = await prisma.artifactRelation.findFirst({
    where: {
      childType: "Project",
      childId: projectId,
      relationType: "NEW_VARIANT_OF",
    },
  });
  if (!relation) throw new Error("Not a variant project");

  const newStatus: VariantStatus = approved ? "APPROVED" : "REJECTED";

  await prisma.project.update({
    where: { id: projectId },
    data: {
      status: newStatus,
      approvedAt: approved ? new Date() : null,
      approvedBy: session.userId,
    },
  });

  await prisma.governanceEvent.create({
    data: {
      projectId,
      type: approved ? "ARTIFACT_VARIANT_APPROVED" : "ARTIFACT_VARIANT_REJECTED",
      actor: session.userId,
      details: {
        projectId,
        parentArtifactId: relation.parentId,
        approved,
      },
    },
  });

  return { status: newStatus };
}
