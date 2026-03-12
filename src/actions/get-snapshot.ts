"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getSnapshot(snapshotId: string) {
  const session = await getSession();

  const snapshot = await prisma.projectSnapshot.findUnique({
    where: { id: snapshotId },
    select: { id: true, label: true, data: true, createdAt: true, projectId: true },
  });

  if (!snapshot) throw new Error("Snapshot not found");

  const project = await prisma.project.findUnique({
    where: { id: snapshot.projectId },
    select: { userId: true },
  });

  if (!project) throw new Error("Project not found");

  const isOwner =
    !project.userId || (!!session && project.userId === session.userId);
  if (!isOwner) throw new Error("Unauthorized");

  return snapshot;
}
