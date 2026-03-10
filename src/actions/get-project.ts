"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getProject(projectId: string) {
  const session = await getSession();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  // If the project belongs to a specific user, verify the requester matches.
  // Anonymous projects (userId === null) are accessible without authentication.
  if (project.userId && (!session || project.userId !== session.userId)) {
    throw new Error("Unauthorized");
  }

  let messages: unknown[];
  let data: Record<string, unknown>;
  try {
    messages = JSON.parse(project.messages);
  } catch {
    messages = [];
  }
  try {
    data = JSON.parse(project.data);
  } catch {
    data = {};
  }

  return {
    id: project.id,
    name: project.name,
    messages,
    data,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}