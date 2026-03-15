"use server";

import { prisma } from "@/lib/prisma";

export interface DatasetSnapshotArtifact {
  id: string;
  name: string;
  version: string;
  branchName: string;
  manifest: unknown;
  relationType: string;
}

export interface DatasetSnapshotPageData {
  snapshot: {
    id: string;
    name: string;
    description: string | null;
    format: string | null;
    rowCount: number | null;
    columnSummary: unknown;
    createdAt: Date;
    updatedAt: Date;
  };
  artifacts: DatasetSnapshotArtifact[];
  govEvents: {
    id: string;
    type: string;
    actor: string | null;
    details: unknown;
    timestamp: Date;
  }[];
}

export async function getDatasetSnapshotDetail(
  id: string
): Promise<DatasetSnapshotPageData | null> {
  const snapshot = await prisma.datasetSnapshot.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      format: true,
      rowCount: true,
      columnSummary: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!snapshot) return null;

  // Find all PublicArtifacts linked via ArtifactRelation (INFORMED_BY)
  const relations = await prisma.artifactRelation.findMany({
    where: { parentType: "DatasetSnapshot", parentId: id, childType: "PublicArtifact" },
  });

  let artifacts: DatasetSnapshotArtifact[] = [];
  if (relations.length > 0) {
    const artifactIds = relations.map((r) => r.childId);
    const rows = await prisma.publicArtifact.findMany({
      where: { id: { in: artifactIds } },
      select: { id: true, name: true, version: true, branchName: true, manifest: true },
      orderBy: { createdAt: "desc" },
    });
    const relMap = new Map(relations.map((r) => [r.childId, r.relationType]));
    artifacts = rows.map((a) => ({
      ...a,
      relationType: relMap.get(a.id) ?? "INFORMED_BY",
    }));
  }

  // Get projectIds from linked artifacts for governance events
  const projectIds = artifacts.length > 0
    ? [...new Set(
        (
          await prisma.publicArtifact.findMany({
            where: { id: { in: artifacts.map((a) => a.id) } },
            select: { projectId: true },
          })
        ).map((a) => a.projectId)
      )]
    : [];

  let govEvents: DatasetSnapshotPageData["govEvents"] = [];
  if (projectIds.length > 0) {
    const allEvents = await prisma.governanceEvent.findMany({
      where: {
        projectId: { in: projectIds },
        type: "ARTIFACT_RELATION_CREATED",
      },
      orderBy: { timestamp: "desc" },
      select: { id: true, type: true, actor: true, details: true, timestamp: true },
    });
    // Filter to events where parentId matches this DatasetSnapshot
    govEvents = allEvents.filter((evt) => {
      const d = evt.details as Record<string, unknown> | null;
      return d?.parentId === id && d?.parentType === "DatasetSnapshot";
    });
  }

  return { snapshot, artifacts, govEvents };
}
