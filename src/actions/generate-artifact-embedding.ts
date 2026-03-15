"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeTextEmbedding, MODEL_VERSION } from "@/lib/embeddings";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GenerateEmbeddingResult {
  artifactId: string;
  embeddingId: string;
  modelVersion: string;
  dimension: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildEmbeddingText(artifact: {
  semanticSummary: string | null;
  componentTree: unknown;
  styleSignature: unknown;
  name: string;
  description: string | null;
}): string {
  const parts: string[] = [];

  if (artifact.name) parts.push(artifact.name);
  if (artifact.description) parts.push(artifact.description);
  if (artifact.semanticSummary) parts.push(artifact.semanticSummary);

  // Extract component names from componentTree
  const tree = artifact.componentTree as Record<string, unknown> | null;
  if (tree && typeof tree === "object") {
    const extract = (node: unknown, depth = 0): void => {
      if (depth > 4 || !node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (typeof n.type === "string") parts.push(n.type);
      if (Array.isArray(n.children)) n.children.forEach((c) => extract(c, depth + 1));
    };
    extract(tree);
  }

  // Extract class names and used components from styleSignature
  const sig = artifact.styleSignature as Record<string, unknown> | null;
  if (sig) {
    if (Array.isArray(sig.classes)) parts.push(...sig.classes.slice(0, 20));
    if (Array.isArray(sig.usedComponents)) parts.push(...sig.usedComponents);
    if (Array.isArray(sig.colors)) parts.push(...sig.colors.slice(0, 10));
  }

  return parts.join(" ");
}

// ── Action ────────────────────────────────────────────────────────────────────

/**
 * Generate and store a semantic embedding for a PublicArtifact.
 *
 * The embedding text is built from: name, description, semanticSummary,
 * component tree node types, and styleSignature classes/components.
 *
 * Upserts ArtifactEmbedding and logs ARTIFACT_EMBEDDING_GENERATED.
 */
export async function generateArtifactEmbedding({
  artifactId,
}: {
  artifactId: string;
}): Promise<GenerateEmbeddingResult> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const artifact = await prisma.publicArtifact.findUnique({
    where: { id: artifactId },
    select: {
      id: true,
      projectId: true,
      name: true,
      description: true,
      semanticSummary: true,
      componentTree: true,
      styleSignature: true,
    },
  });
  if (!artifact) throw new Error("Artifact not found");

  const text = buildEmbeddingText(artifact);
  const vector = computeTextEmbedding(text);

  const record = await prisma.artifactEmbedding.upsert({
    where: { artifactId },
    create: { artifactId, vector, modelVersion: MODEL_VERSION },
    update: { vector, modelVersion: MODEL_VERSION, generatedAt: new Date() },
    select: { id: true, modelVersion: true },
  });

  await prisma.governanceEvent.create({
    data: {
      projectId: artifact.projectId,
      type: "ARTIFACT_EMBEDDING_GENERATED",
      actor: "system",
      details: {
        artifactId,
        modelVersion: MODEL_VERSION,
        dimension: vector.length,
        textLength: text.length,
      },
    },
  });

  return {
    artifactId,
    embeddingId: record.id,
    modelVersion: record.modelVersion,
    dimension: vector.length,
  };
}
