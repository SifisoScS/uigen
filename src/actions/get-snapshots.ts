"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getSnapshots(projectId: string) {
  const session = await getSession();

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Project not found");

  const isOwner =
    !project.userId || (!!session && project.userId === session.userId);
  if (!isOwner) throw new Error("Unauthorized");

  return prisma.projectSnapshot.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, label: true, createdAt: true },
  });
}
