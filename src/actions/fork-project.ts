"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function forkProject(projectId: string) {
  const session = await getSession();

  const source = await prisma.project.findUnique({ where: { id: projectId } });
  if (!source) throw new Error("Project not found");

  const isOwner =
    !source.userId || (!!session && source.userId === session.userId);
  if (!isOwner && !source.public) throw new Error("Unauthorized");

  const forked = await prisma.project.create({
    data: {
      name: `${source.name} (fork)`,
      userId: session?.userId ?? null,
      messages: source.messages,
      data: source.data,
      public: false,
    },
  });

  return forked;
}
