"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordVariantOutcome } from "@/lib/agent-reputation";
import { checkWithSovereignGate } from "@/lib/sifiso-gate";

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

  // Sovereign Gate pre-flight check
  const gateResult = await checkWithSovereignGate(
    { uigen_action: "variant_approve", human_approved: approved },
    { throwOnFail: false },  // approval/rejection must always proceed regardless of score
  );

  const newStatus: VariantStatus = approved ? "APPROVED" : "REJECTED";

  const updatedProject = await prisma.project.update({
    where: { id: projectId },
    data: {
      status: newStatus,
      approvedAt: approved ? new Date() : null,
      approvedBy: session.userId,
    },
  });

  if (updatedProject.agentName) {
    await recordVariantOutcome(
      updatedProject.agentName,
      approved,
      projectId,
      relation.parentId,
    );
  }

  await prisma.governanceEvent.create({
    data: {
      projectId,
      type: approved ? "ARTIFACT_VARIANT_APPROVED" : "ARTIFACT_VARIANT_REJECTED",
      actor: session.userId,
      details: {
        projectId,
        parentArtifactId: relation.parentId,
        approved,
        ubuntuScore: gateResult.ubuntu_score,
        gateLogEntryId: gateResult.log_entry_id,
      },
    },
  });

  return { status: newStatus };
}
