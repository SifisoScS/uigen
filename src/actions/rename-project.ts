"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function renameProject(
  projectId: string,
  name: string
): Promise<void> {
  const session = await getSession();

  if (!session) {
    throw new Error("Unauthorized");
  }

  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Project name cannot be empty");
  }

  await prisma.project.update({
    where: { id: projectId, userId: session.userId },
    data: { name: trimmed },
  });
}
