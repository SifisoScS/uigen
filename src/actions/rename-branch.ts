"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Rename all snapshots in a project that have `oldName` → `newName`. */
export async function renameBranch(
  projectId: string,
  oldName: string,
  newName: string
) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  });
  if (!project) throw new Error("Project not found");

  const isOwner = !project.userId || project.userId === session.userId;
  if (!isOwner) throw new Error("Unauthorized");

  await prisma.projectSnapshot.updateMany({
    where: { projectId, branchName: oldName },
    data: { branchName: newName.trim() || null },
  });
}
