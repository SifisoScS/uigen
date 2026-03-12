"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function remixArtifact(artifactId: string) {
  const session = await getSession();

  const artifact = await prisma.publicArtifact.findUnique({
    where: { id: artifactId },
    select: { name: true, filesData: true },
  });
  if (!artifact) throw new Error("Artifact not found");

  const project = await prisma.project.create({
    data: {
      name: `${artifact.name} (remix)`,
      userId: session?.userId ?? null,
      messages: "[]",
      data: artifact.filesData,
      public: false,
    },
  });

  return { projectId: project.id };
}
