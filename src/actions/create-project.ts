"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTemplate } from "@/lib/templates";
import type { FileNode } from "@/lib/file-system";

interface CreateProjectInput {
  name: string;
  messages: any[];
  data: Record<string, any>;
  /** Optional template id — pre-populates the virtual FS with starter files */
  templateId?: string;
}

export async function createProject(input: CreateProjectInput) {
  // Session is optional — anonymous users can create projects (userId will be null).
  // Authenticated users have their projects associated with their account.
  const session = await getSession();

  // Merge template files into initial data if a valid templateId was supplied
  let initialData: Record<string, FileNode | unknown> = input.data;
  if (input.templateId) {
    const template = getTemplate(input.templateId);
    if (template) {
      // template.files is already in the FileNode serialization format
      initialData = { ...template.files };
    }
  }

  const project = await prisma.project.create({
    data: {
      name: input.name,
      userId: session?.userId ?? null,
      messages: JSON.stringify(input.messages),
      data: JSON.stringify(initialData),
    },
  });

  return project;
}