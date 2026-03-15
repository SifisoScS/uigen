"use server";

import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DescendantNode {
  id: string;
  name: string;
  version: string;
  authorId: string | null;
  remixCount: number;
  parentArtifactId: string | null;
  createdAt: Date;
  /** How many levels below the root artifact this node sits (1 = direct child). */
  depth: number;
}

export interface ArtifactDescendantsResult {
  rootId: string;
  descendants: DescendantNode[];
  /** True when the walk was cut short by MAX_DEPTH. */
  depthReached: boolean;
}

const MAX_DEPTH = 5;

const SELECT = {
  id: true,
  name: true,
  version: true,
  authorId: true,
  remixCount: true,
  parentArtifactId: true,
  createdAt: true,
} as const;

// ── Action ────────────────────────────────────────────────────────────────────

/**
 * Walk the descendant tree rooted at `artifactId` up to `depth` levels (max 5).
 *
 * A descendant is any artifact whose `parentArtifactId` chain traces back to
 * `artifactId` — this covers both remixes and published variants.  The result
 * is a flat BFS-ordered list annotated with `depth`.
 */
export async function getArtifactDescendants(
  artifactId: string,
  depth: number = MAX_DEPTH
): Promise<ArtifactDescendantsResult> {
  const clampedDepth = Math.min(MAX_DEPTH, Math.max(1, Math.floor(depth)));

  // Verify root exists
  const root = await prisma.publicArtifact.findUnique({
    where: { id: artifactId },
    select: { id: true },
  });
  if (!root) throw new Error("Artifact not found");

  const descendants: DescendantNode[] = [];
  const visited = new Set<string>([artifactId]);
  let depthReached = false;

  // BFS: queue holds { id, depth }
  let queue: Array<{ id: string; level: number }> = [{ id: artifactId, level: 0 }];

  while (queue.length > 0) {
    const nextQueue: typeof queue = [];

    for (const { id, level } of queue) {
      if (level >= clampedDepth) {
        // We have children at this level but can't go deeper — check if any exist
        const anyChildren = await prisma.publicArtifact.count({
          where: { parentArtifactId: id },
        });
        if (anyChildren > 0) depthReached = true;
        continue;
      }

      const children = await prisma.publicArtifact.findMany({
        where: { parentArtifactId: id },
        orderBy: { createdAt: "asc" },
        select: SELECT,
      });

      for (const child of children) {
        if (visited.has(child.id)) continue; // cycle guard
        visited.add(child.id);
        descendants.push({ ...child, depth: level + 1 });
        nextQueue.push({ id: child.id, level: level + 1 });
      }
    }

    queue = nextQueue;
  }

  return { rootId: artifactId, descendants, depthReached };
}
