"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { walkVirtualFS, extractStyleSignature } from "@/lib/artifact-introspection";
import type { WeightedSuggestion } from "./coordinate-critiques";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScoredSuggestion extends WeightedSuggestion {
  /** Keyword overlap between suggestion text and artifact domain vocabulary [0–1]. */
  relevanceScore: number;
  /** Inverse of artifact complexity; shared suggestions get a bonus [0–1]. */
  safetyScore: number;
  /** Composite score: 50 % agent reputation + 30 % relevance + 20 % safety [0–1]. */
  expectedImpactScore: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Accessibility keywords always bump relevance — nearly always applicable. */
const A11Y_TERMS = new Set([
  "aria",
  "a11y",
  "accessible",
  "accessibility",
  "keyboard",
  "focus",
  "contrast",
  "screen",
  "reader",
  "label",
  "role",
  "tab",
]);

/** Suggestions above this threshold are auto-selectable. */
export const AUTO_SELECT_THRESHOLD = 0.65;

// ── Scoring helpers ───────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
}

function computeRelevanceScore(
  suggestionText: string,
  domainText: string
): number {
  const suggWords = tokenize(suggestionText);
  const a11yBonus = suggWords.some((w) => A11Y_TERMS.has(w)) ? 0.15 : 0;
  if (suggWords.length === 0) return a11yBonus;

  const domainSet = new Set(tokenize(domainText));
  const matchCount = suggWords.filter((w) => domainSet.has(w)).length;
  return Math.min(matchCount / suggWords.length + a11yBonus, 1);
}

function computeSafetyScore(
  contributors: string[],
  baseSafety: number
): number {
  // Suggestions endorsed by multiple agents are less likely to be disruptive
  const sharedBonus = contributors.length > 1 ? 0.1 : 0;
  return Math.min(baseSafety + sharedBonus, 1);
}

// ── Action ────────────────────────────────────────────────────────────────────

/**
 * Score a list of merged critique suggestions against the artifact's actual
 * structure (component tree, style signature, semantic summary) to produce an
 * `expectedImpactScore` for each suggestion.
 *
 * Scoring formula:
 *   expectedImpactScore = agentScore × 0.50
 *                       + relevanceScore × 0.30
 *                       + safetyScore   × 0.20
 *
 * Results are sorted by `expectedImpactScore` descending. Suggestions with
 * a score ≥ AUTO_SELECT_THRESHOLD (0.65) are candidates for auto-selection.
 */
export async function scoreCritiqueSuggestions({
  artifactId,
  suggestions,
}: {
  artifactId: string;
  suggestions: WeightedSuggestion[];
}): Promise<{
  scoredSuggestions: ScoredSuggestion[];
  artifactComplexity: number;
  autoSelectCount: number;
}> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  if (!suggestions || suggestions.length === 0) {
    return { scoredSuggestions: [], artifactComplexity: 0, autoSelectCount: 0 };
  }

  const artifact = await prisma.publicArtifact.findUnique({
    where: { id: artifactId },
    select: {
      id: true,
      projectId: true,
      name: true,
      filesData: true,
      semanticSummary: true,
      styleSignature: true,
      manifest: true,
    },
  });
  if (!artifact) throw new Error("Artifact not found");

  // ── Build domain vocabulary ─────────────────────────────────────────────────

  // Parse tags from manifest
  const manifest = artifact.manifest as Record<string, unknown> | null;
  const tags = Array.isArray(manifest?.tags) ? (manifest.tags as string[]) : [];

  // Extract structural signals from the live filesData
  let styleSignature: ReturnType<typeof extractStyleSignature> = {
    classes: [],
    colors: [],
    spacing: [],
    usedComponents: [],
    propSummary: {},
  };
  let fileCount = 0;
  try {
    const parsed = JSON.parse(artifact.filesData ?? "{}");
    const files = walkVirtualFS(parsed);
    fileCount = files.length;
    styleSignature = extractStyleSignature(artifact.filesData ?? "{}");
  } catch {
    // ignore — fall back to empty
  }

  const domainText = [
    artifact.semanticSummary ?? artifact.name,
    ...styleSignature.usedComponents,
    ...tags,
    // Strip CSS prefixes so "bg-blue-500" contributes "blue"
    ...styleSignature.colors.map((c) => c.replace(/^(bg|text|border|ring)-/, "")),
  ].join(" ");

  // ── Complexity → safety ─────────────────────────────────────────────────────
  // More files → more potential conflict surface → lower base safety
  const complexityFactor = Math.min(fileCount / 10, 1); // 0 (trivial) → 1 (complex)
  const artifactComplexity = parseFloat(complexityFactor.toFixed(4));
  const baseSafetyScore = 1 - complexityFactor * 0.5; // ranges [0.5, 1.0]

  // ── Score each suggestion ───────────────────────────────────────────────────
  const scored: ScoredSuggestion[] = suggestions.map((sugg) => {
    const relevanceScore = parseFloat(
      computeRelevanceScore(sugg.text, domainText).toFixed(4)
    );
    const safetyScore = parseFloat(
      computeSafetyScore(sugg.contributors, baseSafetyScore).toFixed(4)
    );
    const expectedImpactScore = parseFloat(
      (sugg.score * 0.5 + relevanceScore * 0.3 + safetyScore * 0.2).toFixed(4)
    );
    return { ...sugg, relevanceScore, safetyScore, expectedImpactScore };
  });

  // Sort highest expected impact first
  scored.sort((a, b) => b.expectedImpactScore - a.expectedImpactScore);

  const autoSelectCount = scored.filter(
    (s) => s.expectedImpactScore >= AUTO_SELECT_THRESHOLD
  ).length;

  // ── Governance audit ────────────────────────────────────────────────────────
  await prisma.governanceEvent.create({
    data: {
      projectId: artifact.projectId,
      type: "ARTIFACT_SUGGESTIONS_SCORED",
      actor: "system",
      details: {
        artifactId,
        suggestionCount: suggestions.length,
        artifactComplexity,
        autoSelectCount,
        topSuggestion: scored[0]?.text ?? null,
        topScore: scored[0]?.expectedImpactScore ?? null,
      },
    },
  });

  return { scoredSuggestions: scored, artifactComplexity, autoSelectCount };
}
