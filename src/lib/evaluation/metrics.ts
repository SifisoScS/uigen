/**
 * Evaluation metrics computed entirely from a virtual-FS filesData string.
 * No external services required — all signals derive from static analysis
 * of the JSX/TSX source and Tailwind class strings.
 */

import { walkVirtualFS, extractStyleSignature } from "@/lib/artifact-introspection";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EvaluationMetrics {
  /** Ratio of a11y attributes (aria-*, role, alt, tabIndex) to interactive elements [0–1]. */
  accessibilityScore: number;
  /** Ratio of registry-imported components to total unique JSX element names [0–1]. */
  componentCoverage: number;
  /** Inverse of color-token variance — higher means more consistent design token usage [0–1]. */
  styleConsistency: number;
  /** Number of virtual files in the artifact. */
  fileCount: number;
  /** Total lines of code across all files. */
  linesOfCode: number;
  /** Weighted composite: 40% a11y + 35% coverage + 25% style [0–1]. */
  overallScore: number;
}

// ── Thresholds ────────────────────────────────────────────────────────────────

/** overallScore below this → FAILED status. */
export const PASS_THRESHOLD = 0.4;

// ── Accessibility ─────────────────────────────────────────────────────────────

const A11Y_ATTR_RE = /\b(aria-\w+|role=|alt=|tabIndex)/g;
const INTERACTIVE_ELEMENT_RE = /<(button|input|select|textarea|a)\b/g;

function scoreAccessibility(allContent: string): number {
  const a11yCount = (allContent.match(A11Y_ATTR_RE) ?? []).length;
  const interactiveCount = (allContent.match(INTERACTIVE_ELEMENT_RE) ?? []).length;
  if (interactiveCount === 0) return a11yCount > 0 ? 1 : 0.5; // no interactive elements → neutral
  return Math.min(a11yCount / interactiveCount, 1);
}

// ── Component coverage ────────────────────────────────────────────────────────

const IMPORT_RE = /import\s+\{([^}]+)\}\s+from\s+["']@\/components\/[^"']+["']/g;
const JSX_TAG_RE = /<([A-Z][A-Za-z0-9.]*)/g;

function scoreComponentCoverage(files: { content: string }[]): number {
  const registryComponents = new Set<string>();
  const jsxComponents = new Set<string>();

  for (const f of files) {
    let m: RegExpExecArray | null;

    const importRe = new RegExp(IMPORT_RE.source, "g");
    while ((m = importRe.exec(f.content)) !== null) {
      for (const raw of m[1].split(",")) {
        const name = raw.trim().split(/\s+as\s+/).pop()?.trim() ?? "";
        if (/^[A-Z]/.test(name)) registryComponents.add(name);
      }
    }

    const tagRe = new RegExp(JSX_TAG_RE.source, "g");
    while ((m = tagRe.exec(f.content)) !== null) {
      jsxComponents.add(m[1]);
    }
  }

  if (jsxComponents.size === 0) return 0;
  return Math.min(registryComponents.size / jsxComponents.size, 1);
}

// ── Style consistency ─────────────────────────────────────────────────────────

function scoreStyleConsistency(filesData: string): number {
  const sig = extractStyleSignature(filesData);
  const totalClasses = sig.classes.length + sig.colors.length + sig.spacing.length;
  if (totalClasses === 0) return 1; // no classes → fully consistent (trivially)
  // Penalty: many distinct colors relative to total classes → low consistency
  const colorRatio = sig.colors.length / totalClasses;
  return parseFloat(Math.max(1 - colorRatio, 0).toFixed(4));
}

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Compute all evaluation metrics from a serialised virtual-FS `filesData` string.
 * Safe to call with any string — parse errors return minimal/zero metrics.
 */
export function computeEvaluationMetrics(filesData: string): EvaluationMetrics {
  let parsed: unknown;
  try {
    parsed = JSON.parse(filesData);
  } catch {
    return {
      accessibilityScore: 0,
      componentCoverage: 0,
      styleConsistency: 1,
      fileCount: 0,
      linesOfCode: 0,
      overallScore: 0,
    };
  }

  const files = walkVirtualFS(parsed);
  const fileCount = files.length;
  const linesOfCode = files.reduce((sum, f) => sum + f.content.split("\n").length, 0);
  const allContent = files.map((f) => f.content).join("\n");

  const accessibilityScore = parseFloat(scoreAccessibility(allContent).toFixed(4));
  const componentCoverage = parseFloat(scoreComponentCoverage(files).toFixed(4));
  const styleConsistency = scoreStyleConsistency(filesData);

  const overallScore = parseFloat(
    (accessibilityScore * 0.4 + componentCoverage * 0.35 + styleConsistency * 0.25).toFixed(4)
  );

  return {
    accessibilityScore,
    componentCoverage,
    styleConsistency,
    fileCount,
    linesOfCode,
    overallScore,
  };
}
