"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function toggleProjectPublic(projectId: string, makePublic: boolean) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Project not found");
  if (project.userId !== session.userId) throw new Error("Unauthorized");

  await prisma.project.update({
    where: { id: projectId },
    data: { public: makePublic },
  });

  revalidatePath(`/${projectId}`);
}
