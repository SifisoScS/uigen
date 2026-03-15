"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface SyncExternalLineageResult {
  repoId: string;
  repoName: string;
  /** Number of cross-repo ArtifactRelation records inspected. */
  linksInspected: number;
  /** Number of links whose remote artifact was still reachable. */
  linksReachable: number;
  /** Number of links whose remote artifact returned 404 / error. */
  linksUnreachable: number;
  syncedAt: Date;
}

/**
 * Pull-sync all cross-repo links for one ExternalRepo.
 *
 * For each ArtifactRelation where externalRepoId matches and parentType is
 * "ExternalArtifact", attempt a HEAD request against the externalArtifactUrl to
 * verify the remote artifact still exists.
 *
 * Side-effects:
 *  - Updates ExternalRepo.lastSyncAt
 *  - Emits EXTERNAL_LINEAGE_SYNCED governance event (projectId = first local artifact's project)
 *
 * Unreachable links are reported but NOT deleted — human review is required.
 */
export async function syncExternalLineage(
  externalRepoId: string
): Promise<SyncExternalLineageResult> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const repo = await prisma.externalRepo.findUnique({
    where: { id: externalRepoId },
    select: { id: true, name: true, url: true, apiKey: true },
  });
  if (!repo) throw new Error("ExternalRepo not found");

  // Fetch all cross-repo links for this registry
  const relations = await prisma.artifactRelation.findMany({
    where: {
      externalRepoId,
      parentType: "ExternalArtifact",
    },
    select: {
      id: true,
      childId: true,
      externalArtifactUrl: true,
    },
  });

  const headers: Record<string, string> = {};
  if (repo.apiKey) headers["Authorization"] = `Bearer ${repo.apiKey}`;

  let reachable = 0;
  let unreachable = 0;

  await Promise.all(
    relations.map(async (rel) => {
      if (!rel.externalArtifactUrl) {
        unreachable++;
        return;
      }
      try {
        const res = await fetch(rel.externalArtifactUrl, {
          method: "HEAD",
          headers,
          cache: "no-store",
        });
        if (res.ok) reachable++;
        else unreachable++;
      } catch {
        unreachable++;
      }
    })
  );

  // Update lastSyncAt
  await prisma.externalRepo.update({
    where: { id: externalRepoId },
    data: { lastSyncAt: new Date() },
  });

  // Find a representative projectId for governance event (first linked artifact's project)
  let projectId = "system";
  if (relations.length > 0) {
    const firstArtifact = await prisma.publicArtifact.findUnique({
      where: { id: relations[0].childId },
      select: { projectId: true },
    });
    if (firstArtifact) projectId = firstArtifact.projectId;
  }

  await prisma.governanceEvent.create({
    data: {
      type: "EXTERNAL_LINEAGE_SYNCED",
      projectId,
      actor: session.userId,
      details: {
        repoId: externalRepoId,
        repoName: repo.name,
        linksInspected: relations.length,
        linksReachable: reachable,
        linksUnreachable: unreachable,
      },
    },
  });

  return {
    repoId: repo.id,
    repoName: repo.name,
    linksInspected: relations.length,
    linksReachable: reachable,
    linksUnreachable: unreachable,
    syncedAt: new Date(),
  };
}
