"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceBranchPolicy } from "@/lib/governance/enforce";
import {
  computeFilesHash,
  computePolicyHash,
  generateSemanticSummary,
  parseComponentTree,
  extractStyleSignature,
} from "@/lib/artifact-introspection";
import { checkWithSovereignGate } from "@/lib/sifiso-gate";
import { generateArtifactEmbedding } from "@/actions/generate-artifact-embedding";

export async function publishArtifact({
  projectId,
  branchName,
  name,
  description,
  version = "1.0.0",
  tags = [],
  previewImage = null,
  workflowRunId = null,
  datasetSnapshotId = null,
}: {
  projectId: string;
  branchName: string;
  name: string;
  description?: string;
  version?: string;
  tags?: string[];
  previewImage?: string | null;
  workflowRunId?: string | null;
  datasetSnapshotId?: string | null;
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
    select: { userId: true, data: true, remixedFromArtifactId: true },
  });
  if (!project) throw new Error("Project not found");
  if (project.userId && project.userId !== session.userId) {
    throw new Error("Unauthorized");
  }

  // Propagate parent lineage when this project was remixed from an artifact
  const parentArtifactId = project.remixedFromArtifactId ?? null;

  // 5. Compute hashes + introspection
  const filesHash = computeFilesHash(project.data);
  const policyHash = computePolicyHash(policy as unknown as Record<string, unknown>);
  const semanticSummary = generateSemanticSummary(name, description, project.data, tags);
  const componentTree   = parseComponentTree(name, project.data);
  const styleSignature  = extractStyleSignature(project.data);

  // 6. Build manifest
  const manifest = {
    name,
    description: description ?? null,
    version,
    projectId,
    branchName,
    releasedAt: new Date().toISOString(),
    releasedBy: session.userId,
    parentArtifactId,
    governancePolicy: {
      policyType: policy.policyType,
      policyHash,
    },
    filesHash,
    previewImageUrl: previewImage ?? null,
    registryTags: tags,
  };

  // 6b. Sovereign Gate pre-flight check
  const gateResult = await checkWithSovereignGate({
    uigen_action: "artifact_publish",
    artifact_name: name,
    artifact_description: description,
    semantic_summary: semanticSummary,
    tags,
  });

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
      parentArtifactId,
      semanticSummary,
      componentTree,
      styleSignature,
    },
  });

  // 7b. Generate semantic embedding (fire-and-forget — non-critical)
  generateArtifactEmbedding({ artifactId: artifact.id }).catch(() => {});

  // 8. Update manifest with the artifact id
  await prisma.publicArtifact.update({
    where: { id: artifact.id },
    data: { manifest: { ...manifest, id: artifact.id } },
  });

  // 9. Governance event — publish
  await prisma.governanceEvent.create({
    data: {
      projectId,
      type: "ARTIFACT_PUBLISHED",
      actor: session.userId,
      details: {
          artifactId: artifact.id,
          version,
          branchName,
          name,
          ubuntuScore: gateResult.ubuntu_score,
          gateLogEntryId: gateResult.log_entry_id,
        },
    },
  });

  // 9b. Governance event — introspection generated
  await prisma.governanceEvent.create({
    data: {
      projectId,
      type: "ARTIFACT_INTROSPECTION_GENERATED",
      actor: session.userId,
      details: {
        artifactId: artifact.id,
        summaryExcerpt: semanticSummary.slice(0, 100),
        classCount: styleSignature.classes.length + styleSignature.colors.length,
        usedComponentCount: styleSignature.usedComponents.length,
      },
    },
  });

  // 10. Cross-artifact relation (optional WorkflowRun linkage)
  if (workflowRunId) {
    const run = await prisma.workflowRun.findUnique({
      where: { id: workflowRunId },
      select: { id: true },
    });
    if (!run) throw new Error(`WorkflowRun not found: ${workflowRunId}`);

    await prisma.artifactRelation.create({
      data: {
        parentType: "WorkflowRun",
        parentId: workflowRunId,
        childType: "PublicArtifact",
        childId: artifact.id,
        relationType: "GENERATED_BY",
      },
    });

    await prisma.governanceEvent.create({
      data: {
        projectId,
        type: "ARTIFACT_RELATION_CREATED",
        actor: session.userId,
        details: {
          parentType: "WorkflowRun",
          parentId: workflowRunId,
          childId: artifact.id,
          relationType: "GENERATED_BY",
        },
      },
    });
  }

  // 11. Cross-artifact relation (optional DatasetSnapshot linkage)
  if (datasetSnapshotId) {
    const ds = await prisma.datasetSnapshot.findUnique({
      where: { id: datasetSnapshotId },
      select: { id: true },
    });
    if (!ds) throw new Error(`DatasetSnapshot not found: ${datasetSnapshotId}`);

    await prisma.artifactRelation.create({
      data: {
        parentType: "DatasetSnapshot",
        parentId: datasetSnapshotId,
        childType: "PublicArtifact",
        childId: artifact.id,
        relationType: "INFORMED_BY",
      },
    });

    await prisma.governanceEvent.create({
      data: {
        projectId,
        type: "ARTIFACT_RELATION_CREATED",
        actor: session.userId,
        details: {
          parentType: "DatasetSnapshot",
          parentId: datasetSnapshotId,
          childId: artifact.id,
          relationType: "INFORMED_BY",
        },
      },
    });
  }

  return { artifactId: artifact.id };
}
