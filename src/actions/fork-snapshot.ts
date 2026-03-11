"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
    },
  });

  return forked;
}
