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

  const rows = await prisma.projectSnapshot.findMany({
    where: { projectId },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: 50,
    select: {
      id: true,
      label: true,
      name: true,
      tags: true,
      pinned: true,
      createdAt: true,
      _count: { select: { forks: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    name: r.name,
    tags: JSON.parse(r.tags) as string[],
    pinned: r.pinned,
    forkCount: r._count.forks,
    createdAt: r.createdAt,
  }));
}
