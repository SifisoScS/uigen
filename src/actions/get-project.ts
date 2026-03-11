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

  // isOwner: no userId (anonymous project) OR the session user owns it
  const isOwner =
    !project.userId || (!!session && project.userId === session.userId);

  // Allow access if owner OR project is public
  if (!isOwner && !project.public) {
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
    isPublic: project.public,
    isOwner,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}
