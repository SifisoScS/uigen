"use server";

import { prisma } from "@/lib/prisma";

export interface CreateDatasetSnapshotInput {
  name: string;
  description?: string;
  format?: string;
  rowCount?: number;
  columnSummary?: { columns: string[]; types: string[] };
}

export async function createDatasetSnapshot(
  input: CreateDatasetSnapshotInput
): Promise<{ id: string }> {
  const snapshot = await prisma.datasetSnapshot.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      format: input.format ?? null,
      rowCount: input.rowCount ?? null,
      columnSummary: (input.columnSummary ?? undefined) as object | undefined,
    },
    select: { id: true },
  });
  return { id: snapshot.id };
}
