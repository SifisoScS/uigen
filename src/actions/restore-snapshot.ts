"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { enforceBranchPolicy } from "@/lib/governance/enforce";

export async function restoreSnapshot(snapshotId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const snapshot = await prisma.projectSnapshot.findUnique({
    where: { id: snapshotId },
    include: { project: true },
  });
  if (!snapshot) throw new Error("Snapshot not found");
  if (snapshot.project.userId !== session.userId) throw new Error("Unauthorized");

  if (snapshot.branchName) {
    await enforceBranchPolicy({
      projectId: snapshot.projectId,
      branchName: snapshot.branchName,
      actorType: "HUMAN",
      actionType: "RESTORE",
    });
  }

  await prisma.project.update({
    where: { id: snapshot.projectId },
    data: { messages: snapshot.messages, data: snapshot.data },
  });

  revalidatePath(`/${snapshot.projectId}`);

  return { projectId: snapshot.projectId };
}
