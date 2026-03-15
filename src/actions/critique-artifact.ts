"use server";

import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ── Critique schema ────────────────────────────────────────────────────────────

const critiqueSchema = z.object({
  issues: z.array(z.string()).describe("Concrete accessibility or UX issues found in the component"),
  suggestions: z.array(z.string()).describe("Actionable improvement suggestions"),
});

// ── Default stub critique (used when ANTHROPIC_API_KEY is absent) ──────────────

const DEFAULT_CRITIQUE = {
  suggestions: [
    "Add aria-label to interactive elements for screen reader support",
    "Consider using shadcn Button instead of a plain <button> element",
    "Extract repeated color utilities into a consistent theme token",
  ],
  issues: [
    "Missing keyboard navigation on custom interactive elements",
    "Potential color contrast issues in dark mode",
  ],
};

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildCritiquePrompt(
  artifactName: string,
  semanticSummary: string | null,
  componentTree: unknown,
  styleSignature: unknown,
): string {
  const lines: string[] = [
    `Critique this React UI component for accessibility, performance, and shadcn/Tailwind best practices.`,
    ``,
    `Component: ${artifactName}`,
  ];
  if (semanticSummary) lines.push(`Summary: ${semanticSummary}`);
  if (componentTree) lines.push(`Component tree: ${JSON.stringify(componentTree).slice(0, 400)}`);
  if (styleSignature) lines.push(`Style signature: ${JSON.stringify(styleSignature).slice(0, 400)}`);
  lines.push(``, `Return 2–4 issues and 2–4 actionable suggestions.`);
  return lines.join("\n");
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function critiqueArtifact({
  artifactId,
  agentName = "StubAgent",
  prompt,
}: {
  artifactId: string;
  agentName?: string;
  prompt?: string;
}) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  // 1. Verify artifact exists and fetch introspection data
  const artifact = await prisma.publicArtifact.findUnique({
    where: { id: artifactId },
    select: {
      id: true,
      projectId: true,
      name: true,
      filesData: true,
      semanticSummary: true,
      componentTree: true,
      styleSignature: true,
    },
  });
  if (!artifact) throw new Error("Artifact not found");

  // 2. Build critique prompt from introspection data
  const critiquePrompt =
    prompt ??
    buildCritiquePrompt(
      artifact.name,
      artifact.semanticSummary,
      artifact.componentTree,
      artifact.styleSignature,
    );

  // 3. Generate critique — real LLM when API key present, stub fallback otherwise
  let critiqueJson: { issues: string[]; suggestions: string[] } = DEFAULT_CRITIQUE;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && apiKey.trim() !== "") {
    try {
      const { object } = await generateObject({
        model: anthropic("claude-sonnet-4-6"),
        schema: critiqueSchema,
        prompt: critiquePrompt,
      });
      critiqueJson = object;
    } catch {
      // LLM call failed — keep DEFAULT_CRITIQUE
    }
  }

  // 4. Create AgentInvocation record
  const invocation = await prisma.agentInvocation.create({
    data: {
      agentName,
      prompt: critiquePrompt,
      critiqueJson,
    },
  });

  // 5. Cross-artifact relation: AgentInvocation → PublicArtifact (EVALUATED_BY)
  await prisma.artifactRelation.create({
    data: {
      parentType: "AgentInvocation",
      parentId: invocation.id,
      childType: "PublicArtifact",
      childId: artifactId,
      relationType: "EVALUATED_BY",
    },
  });

  // 6. Governance event for the critique
  await prisma.governanceEvent.create({
    data: {
      projectId: artifact.projectId,
      type: "ARTIFACT_CRITIQUE_CREATED",
      actor: agentName.toLowerCase(),
      details: {
        parentType: "AgentInvocation",
        parentId: invocation.id,
        childId: artifactId,
        relationType: "EVALUATED_BY",
        agentName,
      },
    },
  });

  // 7. Auto-variant generation: one Project stub per suggestion
  const variantIds: string[] = [];
  for (const suggestion of critiqueJson.suggestions) {
    const variant = await prisma.project.create({
      data: {
        name: `${artifact.name} — ${suggestion.slice(0, 50)}`,
        data: artifact.filesData,
      },
    });

    await prisma.artifactRelation.create({
      data: {
        parentType: "PublicArtifact",
        parentId: artifactId,
        childType: "Project",
        childId: variant.id,
        relationType: "NEW_VARIANT_OF",
      },
    });

    await prisma.governanceEvent.create({
      data: {
        projectId: artifact.projectId,
        type: "ARTIFACT_VARIANT_CREATED",
        actor: agentName.toLowerCase(),
        details: {
          parentId: artifactId,
          childId: variant.id,
          suggestion,
        },
      },
    });

    variantIds.push(variant.id);
  }

  return { invocationId: invocation.id, variantIds };
}
