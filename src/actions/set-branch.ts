"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Create or clear a branch name, propagating to affected snapshots:
 * - create (branchName non-null): sets this snapshot + all subsequent
 *   snapshots that currently have no branch name.
 * - clear (branchName null): removes branch from this snapshot + all
 *   subsequent snapshots that share the same old branch name.
 */
export async function setBranch(snapshotId: string, branchName: string | null) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const snapshot = await prisma.projectSnapshot.findUnique({
    where: { id: snapshotId },
    select: { projectId: true, createdAt: true, branchName: true },
  });
  if (!snapshot) throw new Error("Snapshot not found");

  const project = await prisma.project.findUnique({
    where: { id: snapshot.projectId },
    select: { userId: true },
  });
  if (!project) throw new Error("Project not found");

  const isOwner = !project.userId || project.userId === session.userId;
  if (!isOwner) throw new Error("Unauthorized");

  const { projectId, createdAt, branchName: oldBranch } = snapshot;

  if (branchName !== null) {
    // Set this snapshot and propagate to subsequent snapshots with no branch
    await prisma.$transaction([
      prisma.projectSnapshot.update({
        where: { id: snapshotId },
        data: { branchName },
      }),
      prisma.projectSnapshot.updateMany({
        where: { projectId, createdAt: { gt: createdAt }, branchName: null },
        data: { branchName },
      }),
    ]);
  } else if (oldBranch) {
    // Clear this snapshot and subsequent snapshots with the same branch
    await prisma.$transaction([
      prisma.projectSnapshot.update({
        where: { id: snapshotId },
        data: { branchName: null },
      }),
      prisma.projectSnapshot.updateMany({
        where: { projectId, createdAt: { gt: createdAt }, branchName: oldBranch },
        data: { branchName: null },
      }),
    ]);
  } else {
    await prisma.projectSnapshot.update({
      where: { id: snapshotId },
      data: { branchName: null },
    });
  }
}
