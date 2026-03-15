/**
 * Shared introspection helpers used by publishArtifact and
 * publishVariantAsArtifact to compute file hashes, semantic summaries,
 * component trees, and style signatures from serialised virtual-FS data.
 */

import { createHash } from "crypto";
import { parse as babelParse } from "@babel/parser";

// ── Hash helpers ──────────────────────────────────────────────────────────────

export function computeFilesHash(data: string): string {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(data);
  } catch {
    return createHash("sha256").update("").digest("hex");
  }

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

export function computePolicyHash(policy: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(policy))
    .digest("hex");
}

// ── Virtual FS walker ─────────────────────────────────────────────────────────

export interface FileEntry { path: string; content: string }

export function walkVirtualFS(node: unknown): FileEntry[] {
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

export function findMainFile(filesData: string): FileEntry | null {
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

export interface ComponentTreeNode {
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
    if (arg?.type === "ParenthesizedExpression") {
      const inner = (arg as ASTNode & { expression: ASTNode }).expression;
      if (inner?.type === "JSXElement") return inner;
    }
    return null;
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

export function parseComponentTree(name: string, filesData: string): object {
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

export function extractComponentSignature(filesData: string): {
  usedComponents: string[];
  propSummary: Record<string, string[]>;
} {
  let parsed: unknown;
  try { parsed = JSON.parse(filesData); } catch { return { usedComponents: [], propSummary: {} }; }
  const files = walkVirtualFS(parsed);

  const registryComponents = new Set<string>();

  const importRe = /import\s+\{([^}]+)\}\s+from\s+["']@\/components\/[^"']+["']/g;
  for (const file of files) {
    let m: RegExpExecArray | null;
    const re = new RegExp(importRe.source, "g");
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

export function generateSemanticSummary(
  name: string,
  description: string | undefined,
  filesData: string,
  tags: string[]
): string {
  if (description && description.length > 10) return description;

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

export function extractStyleSignature(filesData: string): {
  classes: string[];
  colors: string[];
  spacing: string[];
  usedComponents: string[];
  propSummary: Record<string, string[]>;
} {
  let parsed: unknown;
  try { parsed = JSON.parse(filesData); } catch { return { classes: [], colors: [], spacing: [], usedComponents: [], propSummary: {} }; }
  const allContent = walkVirtualFS(parsed).map((f) => f.content).join("\n");

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
