"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface UpdateSnapshotInput {
  snapshotId: string;
  /** User-defined display name. Pass empty string or null to clear (falls back to auto-label). */
  name?: string | null;
  tags?: string[];
  pinned?: boolean;
  branchName?: string | null;
  isVersionTag?: boolean;
  mergedFromSnapshotId?: string | null;
}

export async function updateSnapshot(input: UpdateSnapshotInput) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const snapshot = await prisma.projectSnapshot.findUnique({
    where: { id: input.snapshotId },
    select: { projectId: true },
  });
  if (!snapshot) throw new Error("Snapshot not found");

  const project = await prisma.project.findUnique({
    where: { id: snapshot.projectId },
    select: { userId: true },
  });
  if (!project) throw new Error("Project not found");

  const isOwner =
    !project.userId || project.userId === session.userId;
  if (!isOwner) throw new Error("Unauthorized");

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name?.trim() || null;
  if (input.tags !== undefined) data.tags = JSON.stringify(input.tags);
  if (input.pinned !== undefined) data.pinned = input.pinned;
  if (input.branchName !== undefined) data.branchName = input.branchName?.trim() || null;
  if (input.isVersionTag !== undefined) data.isVersionTag = input.isVersionTag;
  if (input.mergedFromSnapshotId !== undefined) data.mergedFromSnapshotId = input.mergedFromSnapshotId;

  return prisma.projectSnapshot.update({
    where: { id: input.snapshotId },
    data,
  });
}
