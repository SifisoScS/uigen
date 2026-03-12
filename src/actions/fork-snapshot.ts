"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceBranchPolicy } from "@/lib/governance/enforce";

export async function forkSnapshot(snapshotId: string) {
  const session = await getSession();

  const snapshot = await prisma.projectSnapshot.findUnique({
    where: { id: snapshotId },
    include: { project: true },
  });
  if (!snapshot) throw new Error("Snapshot not found");

  const isOwner =
    !snapshot.project.userId ||
    (!!session && snapshot.project.userId === session.userId);
  if (!isOwner && !snapshot.project.public) throw new Error("Unauthorized");

  if (snapshot.branchName) {
    await enforceBranchPolicy({
      projectId: snapshot.projectId,
      branchName: snapshot.branchName,
      actorType: "HUMAN",
      actionType: "FORK",
    });
  }

  const date = new Date(snapshot.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const forked = await prisma.project.create({
    data: {
      name: `${snapshot.project.name} (${date})`,
      userId: session?.userId ?? null,
      messages: snapshot.messages,
      data: snapshot.data,
      public: false,
      forkedFromSnapshotId: snapshotId,
    },
  });

  return forked;
}
