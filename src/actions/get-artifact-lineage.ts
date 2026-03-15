"use server";

import { prisma } from "@/lib/prisma";

// ── Shallow lineage (existing, unchanged) ────────────────────────────────────

export interface ArtifactSummary {
  id: string;
  name: string;
  version: string;
  authorId: string | null;
  createdAt: Date;
}

export interface ArtifactLineage {
  parent: ArtifactSummary | null;
  children: ArtifactSummary[];
}

const SELECT = {
  id: true,
  name: true,
  version: true,
  authorId: true,
  createdAt: true,
} as const;

/**
 * Shallow (1-level) lineage: returns the parent artifact (if this was
 * remixed from one) and all direct children (artifacts remixed from this one).
 */
export async function getArtifactLineage(
  artifactId: string
): Promise<ArtifactLineage> {
  const artifact = await prisma.publicArtifact.findUnique({
    where: { id: artifactId },
    select: { parentArtifactId: true },
  });
  if (!artifact) throw new Error("Artifact not found");

  const [parent, children] = await Promise.all([
    artifact.parentArtifactId
      ? prisma.publicArtifact.findUnique({
          where: { id: artifact.parentArtifactId },
          select: SELECT,
        })
      : Promise.resolve(null),
    prisma.publicArtifact.findMany({
      where: { parentArtifactId: artifactId },
      orderBy: { createdAt: "desc" },
      select: SELECT,
    }),
  ]);

  return { parent: parent ?? null, children };
}

// ── Deep lineage (graph viewer) ───────────────────────────────────────────────

const MAX_DEPTH = 7;

const DEEP_SELECT = {
  id: true,
  name: true,
  version: true,
  description: true,
  authorId: true,
  createdAt: true,
  remixCount: true,
  parentArtifactId: true,
  manifest: true,
  semanticSummary: true,
  styleSignature: true,
  projectId: true,
} as const;

/** Full node shape used by the lineage graph viewer. */
export interface ArtifactNode {
  id: string;
  name: string;
  version: string;
  description: string | null;
  authorId: string | null;
  createdAt: Date;
  remixCount: number;
  policyType: string | null;
  parentArtifactId: string | null;
  semanticSummary: string | null;
  /** First extracted color class (e.g. "bg-violet-500") for graph node swatches. */
  firstColor: string | null;
  /** Registry components used in this artifact (e.g. ["Button", "Card"]). */
  usedComponents: string[];
}

/** A non-UI parent linked via ArtifactRelation (e.g. the WorkflowRun that generated this artifact). */
export interface CrossParentNode {
  id: string;
  parentType: string;    // "WorkflowRun" | "ExternalArtifact" | future types
  parentName: string;
  outputSummary: string | null;
  relationType: string;  // "GENERATED_BY" | "FORKED_FROM_EXTERNAL" | future types
  createdAt: Date;
  /** Set for ExternalArtifact nodes — the absolute URL to the remote artifact. */
  externalArtifactUrl: string | null;
  /** Set for ExternalArtifact nodes — the registered repo id. */
  externalRepoId: string | null;
}

/** A variant Project stub auto-generated from a critique suggestion (NEW_VARIANT_OF). */
export interface VariantNode {
  id: string;
  name: string;
  suggestion: string | null;
  /** Approval status: "DRAFT" | "APPROVED" | "REJECTED" */
  status: string;
  /** True when this variant has been merged back into the original project. */
  isMerged: boolean;
  /** True when applyVariantSuggestion has successfully mutated this variant's files. */
  isMutated: boolean;
  /** Set when a conflict was detected and resolved before the merge completed. */
  conflictResolvedAt: Date | null;
  createdAt: Date;
}

export interface ArtifactLineageDeep {
  /** The artifact being viewed. */
  current: ArtifactNode;
  /** Ancestor chain, oldest first, up to `depth` levels. */
  parents: ArtifactNode[];
  /** Direct children (remixes of current), sorted newest first. */
  children: ArtifactNode[];
  /** True when the ancestor chain was truncated by the depth limit. */
  depthReached: boolean;
  /** Cross-artifact parents (WorkflowRuns etc.) linked via ArtifactRelation. */
  crossParents: CrossParentNode[];
  /** Variant Project stubs generated from critique suggestions (NEW_VARIANT_OF). */
  variants: VariantNode[];
}

type RawDeep = {
  id: string;
  name: string;
  version: string;
  description: string | null;
  authorId: string | null;
  createdAt: Date;
  remixCount: number;
  parentArtifactId: string | null;
  manifest: unknown;
  semanticSummary: string | null;
  styleSignature: unknown;
  projectId: string;
};

function extractPolicyType(manifest: unknown): string | null {
  if (!manifest || typeof manifest !== "object") return null;
  const gov = (manifest as Record<string, unknown>).governancePolicy;
  if (!gov || typeof gov !== "object") return null;
  return ((gov as Record<string, unknown>).policyType as string) ?? null;
}

function extractFirstColor(sig: unknown): string | null {
  if (!sig || typeof sig !== "object") return null;
  const colors = (sig as Record<string, unknown>).colors;
  if (!Array.isArray(colors) || colors.length === 0) return null;
  return typeof colors[0] === "string" ? colors[0] : null;
}

function extractUsedComponents(sig: unknown): string[] {
  if (!sig || typeof sig !== "object") return [];
  const comps = (sig as Record<string, unknown>).usedComponents;
  if (!Array.isArray(comps)) return [];
  return comps.filter((c): c is string => typeof c === "string");
}

function toNode(raw: RawDeep): ArtifactNode {
  return {
    id: raw.id,
    name: raw.name,
    version: raw.version,
    description: raw.description,
    authorId: raw.authorId,
    createdAt: raw.createdAt,
    remixCount: raw.remixCount,
    policyType: extractPolicyType(raw.manifest),
    parentArtifactId: raw.parentArtifactId,
    semanticSummary: raw.semanticSummary,
    firstColor: extractFirstColor(raw.styleSignature),
    usedComponents: extractUsedComponents(raw.styleSignature),
  };
}

/**
 * Deep recursive lineage for the graph viewer.
 *
 * @param artifactId  The artifact to centre the graph on.
 * @param depth       How many parent levels to walk up (1–7, default 1).
 *
 * Cycle detection: a Set of visited IDs prevents infinite loops.
 */
export async function getArtifactLineageDeep(
  artifactId: string,
  depth: number = 1
): Promise<ArtifactLineageDeep> {
  const clampedDepth = Math.min(MAX_DEPTH, Math.max(1, Math.floor(depth)));

  // 1. Fetch the focal artifact
  const currentRaw = await prisma.publicArtifact.findUnique({
    where: { id: artifactId },
    select: DEEP_SELECT,
  });
  if (!currentRaw) throw new Error("Artifact not found");

  const current = toNode(currentRaw);

  // 2. Walk the parent chain (cycle-safe)
  const visited = new Set<string>([artifactId]);
  const parents: ArtifactNode[] = [];
  let depthReached = false;
  let nextId: string | null = currentRaw.parentArtifactId;

  for (let level = 0; level < clampedDepth && nextId !== null; level++) {
    if (visited.has(nextId)) break; // cycle guard
    visited.add(nextId);

    const raw = await prisma.publicArtifact.findUnique({
      where: { id: nextId },
      select: DEEP_SELECT,
    });
    if (!raw) break;

    parents.unshift(toNode(raw)); // prepend → oldest ends up first
    nextId = raw.parentArtifactId;

    if (level === clampedDepth - 1 && nextId && !visited.has(nextId)) {
      depthReached = true;
    }
  }

  // 3. Fetch direct children (one level down only)
  const childrenRaw = await prisma.publicArtifact.findMany({
    where: { parentArtifactId: artifactId },
    orderBy: { createdAt: "desc" },
    select: DEEP_SELECT,
  });

  // 4. Fetch cross-artifact parents via ArtifactRelation (e.g. WorkflowRun)
  const relations = await prisma.artifactRelation.findMany({
    where: { childType: "PublicArtifact", childId: artifactId },
    orderBy: { createdAt: "desc" },
  });

  const crossParents: CrossParentNode[] = [];
  for (const rel of relations) {
    if (rel.parentType === "WorkflowRun") {
      const wr = await prisma.workflowRun.findUnique({
        where: { id: rel.parentId },
        select: { id: true, name: true, outputSummary: true, createdAt: true },
      });
      if (wr) {
        crossParents.push({
          id: wr.id,
          parentType: "WorkflowRun",
          parentName: wr.name,
          outputSummary: wr.outputSummary,
          relationType: rel.relationType,
          createdAt: wr.createdAt,
          externalArtifactUrl: null,
          externalRepoId: null,
        });
      }
    } else if (rel.parentType === "DatasetSnapshot") {
      const ds = await prisma.datasetSnapshot.findUnique({
        where: { id: rel.parentId },
        select: { id: true, name: true, createdAt: true },
      });
      if (ds) {
        crossParents.push({
          id: ds.id,
          parentType: "DatasetSnapshot",
          parentName: ds.name,
          outputSummary: null,
          relationType: rel.relationType,
          createdAt: ds.createdAt,
          externalArtifactUrl: null,
          externalRepoId: null,
        });
      }
    } else if (rel.parentType === "AgentInvocation") {
      const inv = await prisma.agentInvocation.findUnique({
        where: { id: rel.parentId },
        select: { id: true, agentName: true, critiqueJson: true, createdAt: true },
      });
      if (inv) {
        // Surface first suggestion as outputSummary excerpt
        const critique = inv.critiqueJson as Record<string, unknown> | null;
        const suggestions = Array.isArray(critique?.suggestions) ? critique!.suggestions as unknown[] : [];
        const outputSummary =
          suggestions.length > 0 && typeof suggestions[0] === "string"
            ? (suggestions[0] as string).slice(0, 80)
            : null;
        crossParents.push({
          id: inv.id,
          parentType: "AgentInvocation",
          parentName: inv.agentName,
          outputSummary,
          relationType: rel.relationType,
          createdAt: inv.createdAt,
          externalArtifactUrl: null,
          externalRepoId: null,
        });
      }
    } else if (rel.parentType === "ExternalArtifact") {
      // Cross-repo link — no DB record to look up, reconstruct from the relation itself
      const repoName = rel.externalRepoId
        ? (
            await prisma.externalRepo.findUnique({
              where: { id: rel.externalRepoId },
              select: { name: true },
            })
          )?.name ?? rel.externalRepoId
        : "External";
      crossParents.push({
        id: rel.parentId,   // the externalArtifactUrl used as parentId
        parentType: "ExternalArtifact",
        parentName: repoName,
        outputSummary: rel.externalArtifactUrl,
        relationType: rel.relationType,
        createdAt: rel.createdAt,
        externalArtifactUrl: rel.externalArtifactUrl,
        externalRepoId: rel.externalRepoId,
      });
    }
  }

  // 5. Fetch original project's merge state (which variant was last merged in)
  const originalProject = await prisma.project.findUnique({
    where: { id: currentRaw.projectId },
    select: { mergedFromVariantId: true, conflictResolvedAt: true },
  });

  // 6. Fetch variant Projects linked via NEW_VARIANT_OF relations
  const variantRelations = await prisma.artifactRelation.findMany({
    where: {
      parentType: "PublicArtifact",
      parentId: artifactId,
      childType: "Project",
      relationType: "NEW_VARIANT_OF",
    },
    orderBy: { createdAt: "asc" },
  });

  const variants: VariantNode[] = [];
  for (const rel of variantRelations) {
    const project = await prisma.project.findUnique({
      where: { id: rel.childId },
      select: { id: true, name: true, status: true, mutationAppliedAt: true, createdAt: true },
    });
    if (project) {
      // Extract suggestion hint from project name (after " — ")
      const dashIdx = project.name.indexOf(" — ");
      const suggestion = dashIdx !== -1 ? project.name.slice(dashIdx + 3) : null;
      const isMerged = originalProject?.mergedFromVariantId === project.id;
      variants.push({
        id: project.id,
        name: project.name,
        suggestion,
        status: project.status,
        isMerged,
        isMutated: project.mutationAppliedAt !== null,
        conflictResolvedAt: isMerged ? (originalProject?.conflictResolvedAt ?? null) : null,
        createdAt: project.createdAt,
      });
    }
  }

  return {
    current,
    parents,
    children: childrenRaw.map(toNode),
    depthReached,
    crossParents,
    variants,
  };
}
