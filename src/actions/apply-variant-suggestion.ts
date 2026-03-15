"use server";

import { generateText } from "ai";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VirtualFileSystem } from "@/lib/file-system";
import type { FileNode } from "@/lib/file-system";
import { buildStrReplaceTool } from "@/lib/tools/str-replace";
import { buildFileManagerTool } from "@/lib/tools/file-manager";
import { getLanguageModel } from "@/lib/provider";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ApplyVariantResult {
  stepsUsed: number;
  mutatedPaths: string[];
}

// ── Private prompt helpers ────────────────────────────────────────────────────

function buildMutationSystemPrompt(): string {
  return `You are a precise React code editor applying a single targeted improvement to a UI component.

Rules:
- Use str_replace_editor with str_replace to make surgical edits. Avoid rewriting entire files.
- Use the view command to inspect a file before editing if unsure of its current state.
- Do not add new features, refactor unrelated code, or change anything not addressed by the suggestion.
- Do not create new files unless the suggestion explicitly requires a new component.
- Stop after the suggestion has been applied. Do not continue editing.
- Always include the default React import: import React, { ... } from 'react'
- Use double quotes for all JSX string literals.`;
}

function buildMutationUserPrompt({
  suggestion,
  artifact,
}: {
  suggestion: string;
  artifact: {
    name: string;
    semanticSummary: string | null;
    componentTree: unknown;
  };
}): string {
  const lines: string[] = [`Component: ${artifact.name}`];
  if (artifact.semanticSummary) {
    lines.push(`Summary: ${artifact.semanticSummary}`);
  }
  if (artifact.componentTree) {
    lines.push(
      `Component tree: ${JSON.stringify(artifact.componentTree).slice(0, 300)}`
    );
  }
  lines.push(
    ``,
    `Apply this improvement to the code:`,
    `"${suggestion}"`,
    ``,
    `The virtual file system is already loaded. Use str_replace_editor to apply the minimal change required by the suggestion above.`
  );
  return lines.join("\n");
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function applyVariantSuggestion({
  variantProjectId,
}: {
  variantProjectId: string;
}): Promise<ApplyVariantResult> {
  // 1. Auth guard
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  // 2. Verify this is a variant project via ArtifactRelation
  const relation = await prisma.artifactRelation.findFirst({
    where: {
      childType: "Project",
      childId: variantProjectId,
      relationType: "NEW_VARIANT_OF",
    },
  });
  if (!relation) throw new Error("Not a variant project");

  const parentArtifactId = relation.parentId;

  // 3. Load the variant project
  const project = await prisma.project.findUnique({
    where: { id: variantProjectId },
  });
  if (!project) throw new Error("Project not found");

  // Idempotency guard
  if (project.mutationAppliedAt !== null) {
    return { stepsUsed: 0, mutatedPaths: [] };
  }

  // 4. Parse suggestion from project name (encoded as "ArtifactName — suggestion")
  const dashIdx = project.name.indexOf(" \u2014 ");
  if (dashIdx === -1) throw new Error("No suggestion found in project name");
  const suggestion = project.name.slice(dashIdx + 3);

  // 5. Fetch parent artifact metadata
  const artifact = await prisma.publicArtifact.findUnique({
    where: { id: parentArtifactId },
    select: {
      name: true,
      projectId: true,
      semanticSummary: true,
      componentTree: true,
    },
  });
  if (!artifact) throw new Error("Parent artifact not found");

  // 6. Reconstruct virtual file system from project data
  const fs = new VirtualFileSystem();
  const nodes = JSON.parse(project.data) as Record<string, FileNode>;
  fs.deserializeFromNodes(nodes);

  // 7. Build tools
  const tools = {
    str_replace_editor: buildStrReplaceTool(fs),
    file_manager: buildFileManagerTool(fs),
  };

  // 8. Run generateText with bounded steps
  const result = await generateText({
    model: getLanguageModel(),
    system: buildMutationSystemPrompt(),
    prompt: buildMutationUserPrompt({ suggestion, artifact }),
    tools,
    maxSteps: 10,
  });

  // 9. Extract mutated paths from tool calls across all steps
  const mutatedPaths = [
    ...new Set(
      result.steps.flatMap((step) =>
        step.toolCalls
          .filter(
            (tc) =>
              tc.toolName === "str_replace_editor" ||
              tc.toolName === "file_manager"
          )
          .map((tc) => (tc.args as { path?: string }).path)
          .filter((p): p is string => p != null)
      )
    ),
  ];

  // 10. Persist mutated file system and stamp mutationAppliedAt
  await prisma.project.update({
    where: { id: variantProjectId },
    data: {
      data: JSON.stringify(fs.serialize()),
      mutationAppliedAt: new Date(),
    },
  });

  // 11. Log governance event
  await prisma.governanceEvent.create({
    data: {
      projectId: artifact.projectId,
      type: "ARTIFACT_VARIANT_MUTATED",
      actor: "claude",
      details: {
        variantProjectId,
        parentArtifactId,
        suggestion,
        stepsUsed: result.steps.length,
        mutatedPaths,
      },
    },
  });

  // 12. Return result
  return { stepsUsed: result.steps.length, mutatedPaths };
}
