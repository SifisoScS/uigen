"use server";

import { createHash } from "crypto";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceBranchPolicy } from "@/lib/governance/enforce";

function computeFilesHash(data: string): string {
  // Parse the serialized project data and extract all file paths + contents
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(data);
  } catch {
    return createHash("sha256").update("").digest("hex");
  }

  // Collect all file entries (path → content), sort by path
  const entries: Array<{ path: string; content: string }> = [];
  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    if (n.type === "file" && typeof n.path === "string") {
      entries.push({ path: n.path, content: String(n.content ?? "") });
    }
    if (n.children && typeof n.children === "object") {
      for (const child of Object.values(n.children)) {
        walk(child);
      }
    }
  }
  walk(parsed);
  entries.sort((a, b) => a.path.localeCompare(b.path));

  const combined = entries.map((e) => `${e.path}:${e.content}`).join("\n");
  return createHash("sha256").update(combined).digest("hex");
}

function computePolicyHash(policy: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(policy))
    .digest("hex");
}

export async function publishArtifact({
  projectId,
  branchName,
  name,
  description,
  version = "1.0.0",
  tags = [],
  previewImage = null,
}: {
  projectId: string;
  branchName: string;
  name: string;
  description?: string;
  version?: string;
  tags?: string[];
  previewImage?: string | null;
}) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  // 1. Governance enforcement (allows PUBLISH on release/*)
  await enforceBranchPolicy({
    projectId,
    branchName,
    actorType: "HUMAN",
    actionType: "PUBLISH",
  });

  // 2. Must be a release/* branch
  if (!branchName.startsWith("release/")) {
    throw new Error("Publishing is only allowed from release/* branches");
  }

  // 3. Must have HUMAN_ONLY policy
  const policy = await prisma.branchPolicy.findUnique({
    where: { projectId_branchName: { projectId, branchName } },
  });
  if (policy?.policyType !== "HUMAN_ONLY") {
    throw new Error(
      "Publishing is only allowed on branches with HUMAN_ONLY policy"
    );
  }

  // 4. Ownership check
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true, data: true },
  });
  if (!project) throw new Error("Project not found");
  if (project.userId && project.userId !== session.userId) {
    throw new Error("Unauthorized");
  }

  // 5. Compute hashes
  const filesHash = computeFilesHash(project.data);
  const policyHash = computePolicyHash(policy as unknown as Record<string, unknown>);

  // 6. Build manifest
  const manifest = {
    name,
    description: description ?? null,
    version,
    projectId,
    branchName,
    releasedAt: new Date().toISOString(),
    releasedBy: session.userId,
    parentArtifactId: null,
    governancePolicy: {
      policyType: policy.policyType,
      policyHash,
    },
    filesHash,
    previewImageUrl: previewImage ?? null,
    registryTags: tags,
  };

  // 7. Create PublicArtifact row
  const artifact = await prisma.publicArtifact.create({
    data: {
      projectId,
      branchName,
      version,
      name,
      description: description ?? null,
      manifest,
      filesData: project.data,
      previewImage: previewImage ?? null,
      authorId: session.userId,
    },
  });

  // 8. Update manifest with the artifact id
  await prisma.publicArtifact.update({
    where: { id: artifact.id },
    data: { manifest: { ...manifest, id: artifact.id } },
  });

  // 9. Governance event
  await prisma.governanceEvent.create({
    data: {
      projectId,
      type: "ARTIFACT_PUBLISHED",
      actor: session.userId,
      details: { artifactId: artifact.id, version, branchName, name },
    },
  });

  return { artifactId: artifact.id };
}
