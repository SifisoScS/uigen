"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  computeFilesHash,
  computePolicyHash,
  generateSemanticSummary,
  parseComponentTree,
  extractStyleSignature,
} from "@/lib/artifact-introspection";
import { computeSemanticDelta } from "@/lib/semantic-delta";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PublishVariantAsArtifactInput {
  /** The variant Project id that was merged (source of the change). */
  variantProjectId: string;
  /** The original PublicArtifact that the variant was generated from. */
  originalArtifactId: string;
  /** Optional human-supplied name override. Defaults to parent artifact name. */
  name?: string;
  /** Optional description for the new generation. */
  description?: string;
  /** Optional preview image data URL. */
  previewImage?: string | null;
  /** Optional tags. Inherits parent tags if not supplied. */
  tags?: string[];
}

export interface PublishVariantAsArtifactResult {
  artifactId: string;
  version: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function incrementMinorVersion(version: string): string {
  const parts = version.split(".").map(Number);
  if (parts.length === 1) return `${parts[0]}.1`;
  parts[1] = (parts[1] ?? 0) + 1;
  if (parts.length >= 3) parts[2] = 0;
  return parts.join(".");
}

// ── Action ────────────────────────────────────────────────────────────────────

/**
 * Promote a merged variant into the next PublicArtifact generation.
 *
 * Guards:
 *   - Session required (Unauthorized)
 *   - Variant must be linked to the artifact via NEW_VARIANT_OF relation
 *   - Original project must have mergedFromVariantId === variantProjectId
 *
 * filesData source:
 *   - If originalProject.conflictResolvedAt is set  → use originalProject.data
 *     (resolveVariantConflict already wrote the merged tree there)
 *   - Otherwise (clean merge via mergeVariant)       → use variantProject.data
 *     (mergeVariant never updates originalProject.data on a clean path)
 */
export async function publishVariantAsArtifact({
  variantProjectId,
  originalArtifactId,
  name,
  description,
  previewImage = null,
  tags,
}: PublishVariantAsArtifactInput): Promise<PublishVariantAsArtifactResult> {
  // 1. Auth guard
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  // 2. Verify variant-to-artifact link
  const relation = await prisma.artifactRelation.findFirst({
    where: {
      parentType: "PublicArtifact",
      parentId: originalArtifactId,
      childType: "Project",
      childId: variantProjectId,
      relationType: "NEW_VARIANT_OF",
    },
  });
  if (!relation) throw new Error("Variant is not linked to this artifact");

  // 3. Fetch variant project
  const variantProject = await prisma.project.findUnique({
    where: { id: variantProjectId },
    select: { id: true, data: true, name: true },
  });
  if (!variantProject) throw new Error("Variant project not found");

  // 4. Fetch original artifact
  const originalArtifact = await prisma.publicArtifact.findUnique({
    where: { id: originalArtifactId },
    select: {
      id: true,
      name: true,
      version: true,
      projectId: true,
      description: true,
      manifest: true,
      filesData: true,
    },
  });
  if (!originalArtifact) throw new Error("Artifact not found");

  // 5. Fetch original project and confirm variant was merged
  const originalProject = await prisma.project.findUnique({
    where: { id: originalArtifact.projectId },
    select: {
      id: true,
      data: true,
      mergedFromVariantId: true,
      conflictResolvedAt: true,
      userId: true,
    },
  });
  if (!originalProject) throw new Error("Original project not found");
  if (originalProject.mergedFromVariantId !== variantProjectId) {
    throw new Error("Variant must be merged before publishing as artifact");
  }

  // 6. Ownership check
  if (originalProject.userId && originalProject.userId !== session.userId) {
    throw new Error("Unauthorized");
  }

  // 6b. Evaluation gate — block if the most recent EvaluationRun for this
  //     artifact explicitly FAILED (no evaluation = allowed for backwards compat)
  const latestEval = await prisma.evaluationRun.findFirst({
    where: { artifactId: originalArtifactId },
    orderBy: { createdAt: "desc" },
    select: { status: true },
  });
  if (latestEval?.status === "FAILED") {
    throw new Error(
      "Artifact has a failed evaluation run — resolve regressions before publishing"
    );
  }

  // 7. Determine filesData source
  const filesData = originalProject.conflictResolvedAt !== null
    ? originalProject.data    // conflict-resolved: merged tree written to original project
    : variantProject.data;    // clean merge: mutation-applied content lives in variant

  // 8. Compute next version
  const nextVersion = incrementMinorVersion(originalArtifact.version);

  // 9. Derive name, description, tags
  const resolvedName = name ?? originalArtifact.name;

  // Extract suggestion from variant project name (encoded as "ArtifactName — suggestion")
  const dashIdx = variantProject.name.indexOf(" \u2014 ");
  const suggestion = dashIdx !== -1 ? variantProject.name.slice(dashIdx + 3) : null;

  const resolvedDescription = description
    ?? (suggestion ? `Generated from variant: ${suggestion}` : originalArtifact.description ?? undefined);

  const parentTags: string[] = (() => {
    try {
      const m = originalArtifact.manifest as Record<string, unknown>;
      return Array.isArray(m.registryTags) ? (m.registryTags as string[]) : [];
    } catch { return []; }
  })();
  const resolvedTags = tags ?? parentTags;

  // 10. Compute hashes and introspection
  const filesHash = computeFilesHash(filesData);
  const semanticSummary = generateSemanticSummary(resolvedName, resolvedDescription, filesData, resolvedTags);
  const componentTree = parseComponentTree(resolvedName, filesData);
  const styleSignature = extractStyleSignature(filesData);
  const policyHash = computePolicyHash({ policyType: "VARIANT_PUBLISH" });

  // 11. Build manifest
  const manifest = {
    name: resolvedName,
    description: resolvedDescription ?? null,
    version: nextVersion,
    projectId: originalArtifact.projectId,
    branchName: "variant-publish",
    releasedAt: new Date().toISOString(),
    releasedBy: session.userId,
    parentArtifactId: originalArtifactId,
    variantProjectId,
    governancePolicy: {
      policyType: "VARIANT_PUBLISH",
      policyHash,
    },
    filesHash,
    previewImageUrl: previewImage ?? null,
    registryTags: resolvedTags,
  };

  // 12. Create PublicArtifact row
  const newArtifact = await prisma.publicArtifact.create({
    data: {
      projectId: originalArtifact.projectId,
      branchName: "variant-publish",
      version: nextVersion,
      name: resolvedName,
      description: resolvedDescription ?? null,
      manifest,
      filesData,
      previewImage: previewImage ?? null,
      authorId: session.userId,
      parentArtifactId: originalArtifactId,
      semanticSummary,
      componentTree,
      styleSignature,
    },
  });

  // 12b. Compute semantic delta and record transform trace
  const delta = computeSemanticDelta(originalArtifact.filesData, filesData);
  await prisma.semanticTransform.create({
    data: {
      fromArtifactId: originalArtifactId,
      toArtifactId: newArtifact.id,
      addedComponents: delta.addedComponents,
      removedComponents: delta.removedComponents,
      modifiedProps: delta.modifiedProps,
      a11yDelta: delta.a11yDelta,
      linesChanged: delta.linesChanged,
    },
  });

  await prisma.governanceEvent.create({
    data: {
      projectId: originalArtifact.projectId,
      type: "SEMANTIC_TRANSFORM_RECORDED",
      actor: session.userId,
      details: {
        fromArtifactId: originalArtifactId,
        toArtifactId: newArtifact.id,
        addedComponents: delta.addedComponents,
        removedComponents: delta.removedComponents,
        a11yDelta: delta.a11yDelta,
        linesChanged: delta.linesChanged,
      },
    },
  });

  // 13. Patch manifest with the new artifact id
  await prisma.publicArtifact.update({
    where: { id: newArtifact.id },
    data: { manifest: { ...manifest, id: newArtifact.id } },
  });

  // 14. Log ARTIFACT_VARIANT_PUBLISHED governance event
  await prisma.governanceEvent.create({
    data: {
      projectId: originalArtifact.projectId,
      type: "ARTIFACT_VARIANT_PUBLISHED",
      actor: session.userId,
      details: {
        artifactId: newArtifact.id,
        parentArtifactId: originalArtifactId,
        variantProjectId,
        version: nextVersion,
        name: resolvedName,
      },
    },
  });

  // 15. Log ARTIFACT_INTROSPECTION_GENERATED governance event
  await prisma.governanceEvent.create({
    data: {
      projectId: originalArtifact.projectId,
      type: "ARTIFACT_INTROSPECTION_GENERATED",
      actor: session.userId,
      details: {
        artifactId: newArtifact.id,
        summaryExcerpt: semanticSummary.slice(0, 100),
        classCount: styleSignature.classes.length + styleSignature.colors.length,
        usedComponentCount: styleSignature.usedComponents.length,
      },
    },
  });

  // 16. Create ArtifactRelation linking the two generations
  await prisma.artifactRelation.upsert({
    where: {
      parentType_parentId_childType_childId: {
        parentType: "PublicArtifact",
        parentId: originalArtifactId,
        childType: "PublicArtifact",
        childId: newArtifact.id,
      },
    },
    create: {
      parentType: "PublicArtifact",
      parentId: originalArtifactId,
      childType: "PublicArtifact",
      childId: newArtifact.id,
      relationType: "VARIANT_PROMOTED_TO",
    },
    update: {},
  });

  return { artifactId: newArtifact.id, version: nextVersion };
}
