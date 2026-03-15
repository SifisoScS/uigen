"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ── Default stub critique ─────────────────────────────────────────────────────

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

// ── Action ────────────────────────────────────────────────────────────────────

export async function critiqueArtifact({
  artifactId,
  agentName = "StubAgent",
  prompt = "Critique this UI component for accessibility, performance, and shadcn best practices",
}: {
  artifactId: string;
  agentName?: string;
  prompt?: string;
}) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  // 1. Verify artifact exists
  const artifact = await prisma.publicArtifact.findUnique({
    where: { id: artifactId },
    select: { id: true, projectId: true, name: true },
  });
  if (!artifact) throw new Error("Artifact not found");

  // 2. Create AgentInvocation (stub critique — placeholder for real LLM call)
  const invocation = await prisma.agentInvocation.create({
    data: {
      agentName,
      prompt,
      critiqueJson: DEFAULT_CRITIQUE,
    },
  });

  // 3. Cross-artifact relation: AgentInvocation → PublicArtifact (EVALUATED_BY)
  await prisma.artifactRelation.create({
    data: {
      parentType: "AgentInvocation",
      parentId: invocation.id,
      childType: "PublicArtifact",
      childId: artifactId,
      relationType: "EVALUATED_BY",
    },
  });

  // 4. Governance event
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

  return { invocationId: invocation.id };
}
