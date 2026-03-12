"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Returns the branchName + policyType for the latest snapshot of a project.
 * Used by the Publish button to decide visibility.
 */
export async function getCurrentBranchPolicy(
  projectId: string
): Promise<{ branchName: string | null; policyType: string | null }> {
  const session = await getSession();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  });
  if (!project) return { branchName: null, policyType: null };

  const isOwner =
    !project.userId || (!!session && project.userId === session.userId);
  if (!isOwner) return { branchName: null, policyType: null };

  const latest = await prisma.projectSnapshot.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: { branchName: true },
  });

  if (!latest?.branchName) return { branchName: null, policyType: null };

  const policy = await prisma.branchPolicy.findUnique({
    where: {
      projectId_branchName: { projectId, branchName: latest.branchName },
    },
    select: { policyType: true },
  });

  return {
    branchName: latest.branchName,
    policyType: policy?.policyType ?? null,
  };
}
