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

// ── Introspection helpers ─────────────────────────────────────────────────────

interface FileEntry { path: string; content: string }

function walkVirtualFS(node: unknown): FileEntry[] {
  if (!node || typeof node !== "object") return [];
  const n = node as Record<string, unknown>;
  const files: FileEntry[] = [];
  if (n.type === "file" && typeof n.path === "string" && typeof n.content === "string") {
    files.push({ path: n.path, content: n.content });
  }
  if (n.children && typeof n.children === "object") {
    for (const child of Object.values(n.children as Record<string, unknown>)) {
      files.push(...walkVirtualFS(child));
    }
  }
  return files;
}

function findMainFile(filesData: string): FileEntry | null {
  let parsed: unknown;
  try { parsed = JSON.parse(filesData); } catch { return null; }
  const files = walkVirtualFS(parsed);
  return (
    files.find((f) => /\bApp\.tsx?$/.test(f.path)) ??
    files.find((f) => f.path.endsWith(".tsx")) ??
    files.find((f) => f.path.endsWith(".jsx")) ??
    null
  );
}

interface TreeNode { type: string; props: Record<string, string>; children: TreeNode[] }

function extractJSXTree(content: string): TreeNode {
  const returnIdx = content.search(/\breturn\s*[\s(]/);
  const jsx = returnIdx >= 0 ? content.slice(returnIdx) : content;

  // Collect opening JSX tags (depth-limited to first 8 elements)
  const tagRe = /<([A-Z][A-Za-z0-9.]*|[a-z][a-z0-9-]*)(\s[^>]*)?\s*\/?>/g;
  type RawTag = { type: string; className?: string };
  const tags: RawTag[] = [];
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(jsx)) !== null && tags.length < 8) {
    const attrs = m[2] ?? "";
    const classMatch = attrs.match(/className=["']([^"']*)["']/);
    tags.push({ type: m[1], className: classMatch?.[1]?.slice(0, 120) });
  }

  if (tags.length === 0) return { type: "unknown", props: {}, children: [] };
  const [root, ...rest] = tags;
  return {
    type: root.type,
    props: root.className ? { className: root.className } : {},
    children: rest.slice(0, 5).map((t) => ({
      type: t.type,
      props: t.className ? { className: t.className } : ({} as Record<string, string>),
      children: [] as TreeNode[],
    })),
  };
}

function generateComponentTree(name: string, filesData: string): object {
  const main = findMainFile(filesData);
  if (!main) return { type: "component", name, props: {}, children: [], _stub: true };
  return { ...extractJSXTree(main.content), _source: main.path };
}

function generateSemanticSummary(
  name: string,
  description: string | undefined,
  filesData: string,
  tags: string[]
): string {
  if (description && description.length > 10) return description;

  // Walk the virtual FS to get actual content for feature detection
  let parsed: unknown;
  try { parsed = JSON.parse(filesData); } catch { /* ignore */ }
  const allContent = parsed ? walkVirtualFS(parsed).map((f) => f.content).join("\n") : filesData;

  const features: string[] = [];
  if (/\bsm:|md:|lg:|xl:/.test(allContent))    features.push("responsive");
  if (/\bdark:/.test(allContent))               features.push("dark mode");
  if (/useState|useReducer/.test(allContent))   features.push("interactive");
  if (/onSubmit|handleSubmit/.test(allContent)) features.push("form");
  if (/\bgrid\b/.test(allContent))              features.push("grid");

  const main = findMainFile(filesData);
  let rootType = "";
  if (main) {
    const match = main.content.match(/return\s*[\s(]*<([A-Z][A-Za-z0-9.]*|[a-z][a-z0-9-]*)/);
    if (match) rootType = match[1];
  }

  const tagHint      = tags.slice(0, 2).join(", ");
  const featureHint  = features.slice(0, 3).join(", ");
  const rootHint     = rootType && rootType.toLowerCase() !== name.toLowerCase() ? rootType : "";
  const parts        = [rootHint, featureHint, tagHint].filter(Boolean).join(" · ");
  return parts ? `${name} — ${parts}` : `${name} component`;
}

function extractStyleSignature(filesData: string): {
  classes: string[];
  colors: string[];
  spacing: string[];
} {
  // Walk the virtual FS so we search actual file content, not the JSON-encoded representation
  let parsed: unknown;
  try { parsed = JSON.parse(filesData); } catch { return { classes: [], colors: [], spacing: [] }; }
  const allContent = walkVirtualFS(parsed).map((f) => f.content).join("\n");

  // Extract class tokens from className="..." strings only (avoids false positives)
  const classStrings = [...allContent.matchAll(/className=["']([^"']*)["']/g)].map((m) => m[1]);
  const allClasses = classStrings.flatMap((s) => s.split(/\s+/).filter(Boolean));

  const colorRe   = /^(?:bg|text|border|ring|fill|stroke|from|to|via)-(?:[a-z]+-\d{2,3}|[a-z]+)$/;
  const spacingRe = /^(?:gap|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|space-[xy])-(?:\d+|\[[\d.]+(?:px|rem|em)\])$/;

  const colors  = [...new Set(allClasses.filter((c) => colorRe.test(c)))].slice(0, 12);
  const spacing = [...new Set(allClasses.filter((c) => spacingRe.test(c)))].slice(0, 12);
  const classes = [...new Set(allClasses)]
    .filter((c) => !colorRe.test(c) && !spacingRe.test(c))
    .slice(0, 15);

  return { classes, colors, spacing };
}

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
  const componentTree   = generateComponentTree(name, project.data);
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
      details: { artifactId: artifact.id, version, branchName, name },
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
