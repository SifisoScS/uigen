"use server";

import { createHash } from "crypto";
import { parse as babelParse } from "@babel/parser";
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

// ── AST helpers ───────────────────────────────────────────────────────────────

interface ASTNode {
  type: string;
  [key: string]: unknown;
}

interface ComponentTreeNode {
  type: "JSXElement";
  name: string;
  props: Record<string, string>;
  children: ComponentTreeNode[];
}

function jsxName(n: ASTNode): string {
  if (n.type === "JSXIdentifier") return n.name as string;
  if (n.type === "JSXMemberExpression") {
    return `${jsxName(n.object as ASTNode)}.${jsxName(n.property as ASTNode)}`;
  }
  if (n.type === "JSXNamespacedName") {
    return `${jsxName(n.namespace as ASTNode)}:${jsxName(n.name as ASTNode)}`;
  }
  return "unknown";
}

function jsxAttrVal(v: ASTNode | null | undefined): string {
  if (!v) return "true";
  if (v.type === "StringLiteral") return String(v.value).slice(0, 60);
  if (v.type === "JSXExpressionContainer") return "dynamic";
  if (v.type === "JSXElement" || v.type === "JSXFragment") return "jsx";
  return "unknown";
}

function buildJSXTree(node: ASTNode, depth: number, maxDepth: number): ComponentTreeNode {
  const opening = node.openingElement as ASTNode;
  const name = jsxName(opening.name as ASTNode);

  const props: Record<string, string> = {};
  for (const attr of (opening.attributes as ASTNode[]) ?? []) {
    if (attr.type === "JSXAttribute") {
      const attrName = jsxName(attr.name as ASTNode);
      props[attrName] = jsxAttrVal(attr.value as ASTNode | null);
    }
    // skip JSXSpreadAttribute
  }

  const children: ComponentTreeNode[] = [];
  if (depth < maxDepth) {
    for (const child of (node.children as ASTNode[]) ?? []) {
      if (child.type === "JSXElement") {
        children.push(buildJSXTree(child, depth + 1, maxDepth));
        if (children.length >= 6) break;
      }
    }
  }

  return { type: "JSXElement", name, props, children };
}

function findReturnJSX(node: unknown): ASTNode | null {
  if (!node || typeof node !== "object") return null;
  const n = node as ASTNode;

  if (n.type === "ReturnStatement") {
    const arg = n.argument as ASTNode | null;
    if (arg?.type === "JSXElement") return arg;
    // Parenthesized: return (<div>...</div>)
    if (arg?.type === "ParenthesizedExpression") {
      const inner = (arg as ASTNode & { expression: ASTNode }).expression;
      if (inner?.type === "JSXElement") return inner;
    }
    return null; // don't recurse further into this return
  }

  for (const key of ["body", "consequent", "alternate", "declarations", "init", "expression", "declaration"]) {
    const child = n[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findReturnJSX(item);
        if (found) return found;
      }
    } else if (child) {
      const found = findReturnJSX(child);
      if (found) return found;
    }
  }
  return null;
}

// Walk every node in the AST and call visitor for each
function walkAST(node: unknown, visit: (n: ASTNode) => void): void {
  if (!node || typeof node !== "object") return;
  const n = node as ASTNode;
  visit(n);
  for (const key of [
    "body", "declarations", "declaration", "expression", "argument", "init",
    "consequent", "alternate", "children", "openingElement", "attributes",
    "properties", "elements", "params", "callee", "arguments", "left", "right",
  ]) {
    const child = n[key];
    if (Array.isArray(child)) {
      for (const item of child) walkAST(item, visit);
    } else if (child) {
      walkAST(child, visit);
    }
  }
}

// ── Component tree + signature extraction ─────────────────────────────────────

/** Parse the main JSX file via @babel/parser and build a depth-4 component tree. */
function parseComponentTree(name: string, filesData: string): object {
  const main = findMainFile(filesData);
  if (!main) return { type: "component", name, props: {}, children: [], _stub: true };

  try {
    const ast = babelParse(main.content, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
      errorRecovery: true,
    });

    const program = (ast as unknown as ASTNode).program as ASTNode;
    const jsxRoot = findReturnJSX(program);

    if (!jsxRoot) return { type: "component", name, props: {}, children: [], _stub: true };

    return { ...buildJSXTree(jsxRoot, 0, 4), _source: main.path };
  } catch {
    return { type: "component", name, props: {}, children: [], _stub: true };
  }
}

/**
 * Extract registry components used in the project and their prop shapes.
 * Detects imports from @/components/ in ALL virtual FS files, then uses
 * @babel/parser to collect prop attribute names per component.
 */
function extractComponentSignature(filesData: string): {
  usedComponents: string[];
  propSummary: Record<string, string[]>;
} {
  let parsed: unknown;
  try { parsed = JSON.parse(filesData); } catch { return { usedComponents: [], propSummary: {} }; }
  const files = walkVirtualFS(parsed);

  const registryComponents = new Set<string>();

  // Pass 1: regex import detection across all files
  const importRe = /import\s+\{([^}]+)\}\s+from\s+["']@\/components\/[^"']+["']/g;
  for (const file of files) {
    let m: RegExpExecArray | null;
    const re = new RegExp(importRe.source, "g"); // reset lastIndex per file
    while ((m = re.exec(file.content)) !== null) {
      for (const raw of m[1].split(",")) {
        const compName = raw.trim().split(/\s+as\s+/).pop()?.trim() ?? "";
        if (/^[A-Z]/.test(compName)) registryComponents.add(compName);
      }
    }
  }

  if (registryComponents.size === 0) {
    return { usedComponents: [], propSummary: {} };
  }

  // Pass 2: AST walk for prop usage
  const propSummary: Record<string, string[]> = {};

  for (const file of files) {
    if (!/\.(tsx?|jsx?)$/.test(file.path)) continue;
    try {
      const ast = babelParse(file.content, {
        sourceType: "module",
        plugins: ["jsx", "typescript"],
        errorRecovery: true,
      });

      walkAST((ast as unknown as ASTNode).program, (n) => {
        if (n.type !== "JSXOpeningElement") return;
        const compName = jsxName(n.name as ASTNode);
        if (!registryComponents.has(compName)) return;
        const attrNames = ((n.attributes as ASTNode[]) ?? [])
          .filter((a) => a.type === "JSXAttribute")
          .map((a) => jsxName(a.name as ASTNode))
          .filter(Boolean);
        if (attrNames.length > 0) {
          const existing = propSummary[compName] ?? [];
          propSummary[compName] = [...new Set([...existing, ...attrNames])].slice(0, 8);
        }
      });
    } catch {
      // ignore unparseable files
    }
  }

  return { usedComponents: [...registryComponents].sort(), propSummary };
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
  usedComponents: string[];
  propSummary: Record<string, string[]>;
} {
  // Walk the virtual FS so we search actual file content, not the JSON-encoded representation
  let parsed: unknown;
  try { parsed = JSON.parse(filesData); } catch { return { classes: [], colors: [], spacing: [], usedComponents: [], propSummary: {} }; }
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

  const { usedComponents, propSummary } = extractComponentSignature(filesData);

  return { classes, colors, spacing, usedComponents, propSummary };
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
