"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getGovernanceEvents(projectId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  });
  if (!project) throw new Error("Project not found");

  const isOwner = !project.userId || project.userId === session.userId;
  if (!isOwner) throw new Error("Unauthorized");

  return prisma.governanceEvent.findMany({
    where: { projectId },
    orderBy: { timestamp: "desc" },
    take: 50,
  });
}
