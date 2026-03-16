"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Sparkles, Loader2, CheckSquare, GitMerge, Zap } from "lucide-react";
import { critiqueArtifact, type AggregatedCritique } from "@/actions/critique-artifact";
import { generateSelectedVariants } from "@/actions/generate-selected-variants";
import { coordinateCritiques, type MergedCritique, type WeightedSuggestion } from "@/actions/coordinate-critiques";
import {
  scoreCritiqueSuggestions,
  type ScoredSuggestion,
  AUTO_SELECT_THRESHOLD,
} from "@/actions/score-critique-suggestions";
import {
  getIKhayaManceNarrative,
  type GetIKhayaManceNarrativeInput,
} from "@/actions/get-ikhaya-mance-narrative";
import type { MANCEDeliberateResponse } from "@/lib/ikhaya";

interface FlatSuggestion extends ScoredSuggestion {
  agentName: string;
  priority: number;
  finalScore: number;
  /** Stable unique key built from agent index + suggestion index. */
  index: number;
}

function agentBadgeClass(agentName: string): string {
  return agentName === "Claude"
    ? "text-violet-400 bg-violet-950/40 border-violet-800/40"
    : "text-blue-400 bg-blue-950/40 border-blue-800/40";
}

function priorityBadgeClass(priority: number): string {
  if (priority === 1) return "text-red-400 bg-red-950/40 border-red-800/40";
  if (priority === 2) return "text-orange-400 bg-orange-950/40 border-orange-800/40";
  return "text-green-400 bg-green-950/40 border-green-800/40";
}

function impactBadgeClass(score: number): string {
  if (score >= 0.75) return "text-emerald-400 bg-emerald-950/40 border-emerald-800/40";
  if (score >= AUTO_SELECT_THRESHOLD) return "text-teal-400 bg-teal-950/40 border-teal-800/40";
  return "text-neutral-500 bg-[#1a1a1a] border-[#2a2a2a]";
}

export function MultiAgentCritiquePanel({ artifactId }: { artifactId: string }) {
  const router = useRouter();
  const [critiques, setCritiques] = useState<AggregatedCritique[] | null>(null);
  const [scoredSuggestions, setScoredSuggestions] = useState<FlatSuggestion[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [critiqueError, setCritiqueError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [coordinateError, setCoordinateError] = useState<string | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);
  const [merged, setMerged] = useState<MergedCritique | null>(null);
  const [manceResult, setManceResult] = useState<MANCEDeliberateResponse | null>(null);
  const [isCritiquing, startCritique] = useTransition();
  const [isGenerating, startGenerate] = useTransition();
  const [isCoordinating, startCoordinate] = useTransition();
  const [isScoring, startScore] = useTransition();
  const [isMancing, startMance] = useTransition();

  // Fall back to a flat list derived from raw critiques when scoring hasn't run yet
  const flatSuggestions: FlatSuggestion[] = scoredSuggestions ?? (critiques
    ? critiques.flatMap((c, agentIdx) =>
        c.suggestions.map((text, suggIdx) => ({
          text,
          agentName: c.agentName,
          priority: c.priority,
          finalScore: c.finalScore,
          index: agentIdx * 1000 + suggIdx,
          score: c.finalScore,
          contributors: [c.agentName],
          relevanceScore: 0,
          safetyScore: 0,
          expectedImpactScore: c.finalScore,
        }))
      )
    : []);

  function handleRequestCritique() {
    setCritiqueError(null);
    startCritique(async () => {
      try {
        const result = await critiqueArtifact({
          artifactId,
          agents: ["Claude", "Grok"],
        });
        setCritiques(result.aggregatedCritiques);
        setSelected(new Set());
      } catch (err) {
        setCritiqueError(err instanceof Error ? err.message : "Critique failed");
      }
    });
  }

  function toggleSelection(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function handleAutoSelect() {
    const highImpact = new Set(
      flatSuggestions
        .filter((s) => s.expectedImpactScore >= AUTO_SELECT_THRESHOLD)
        .map((s) => s.index)
    );
    setSelected(highImpact);
  }

  function handleCoordinateCritiques() {
    if (!critiques) return;
    setCoordinateError(null);
    setScoreError(null);
    startCoordinate(async () => {
      try {
        const coordResult = await coordinateCritiques({ artifactId, agentCritiques: critiques });
        setMerged(coordResult.mergedCritique);

        // Fire MANCE council deliberation non-blocking after merge
        const manceInput: GetIKhayaManceNarrativeInput = {
          artifactId,
          agentNames: critiques.map((c) => c.agentName),
          prompt: `Review the merged critique for artifact ${artifactId} and advise whether the community should proceed.`,
          mergedSuggestions: coordResult.mergedCritique.weightedSuggestions.map((ws) => ({
            text: ws.text,
            score: ws.score,
          })),
          topAgent: coordResult.mergedCritique.topAgentName ?? undefined,
        };
        startMance(async () => {
          try {
            const manceResponse = await getIKhayaManceNarrative(manceInput);
            setManceResult(manceResponse);
          } catch {
            // MANCE is advisory — silently fail, never block the critique flow
          }
        });

        // Score the merged suggestions immediately
        startScore(async () => {
          try {
            const scoreResult = await scoreCritiqueSuggestions({
              artifactId,
              suggestions: coordResult.mergedCritique.weightedSuggestions,
            });

            // Map scored suggestions back onto the flat list with stable indices
            const flat: FlatSuggestion[] = scoreResult.scoredSuggestions.map((ss, i) => {
              // Find original agentIdx/suggIdx to preserve index keying
              const found = flatSuggestions.find(
                (f) => f.text.trim().toLowerCase() === ss.text.trim().toLowerCase()
              );
              return {
                ...ss,
                agentName: found?.agentName ?? ss.contributors[0] ?? "Claude",
                priority: found?.priority ?? 2,
                finalScore: found?.finalScore ?? ss.score,
                index: found?.index ?? i,
              };
            });
            setScoredSuggestions(flat);
          } catch (err) {
            setScoreError(err instanceof Error ? err.message : "Scoring failed");
          }
        });
      } catch (err) {
        setCoordinateError(err instanceof Error ? err.message : "Coordination failed");
      }
    });
  }

  function handleUseMerged() {
    if (!merged) return;
    const suggestions = merged.weightedSuggestions.map((ws: WeightedSuggestion) => ({
      text: ws.text,
      agentName: merged.topAgentName,
    }));
    if (suggestions.length === 0) return;

    setGenerateError(null);
    startGenerate(async () => {
      try {
        await generateSelectedVariants({ artifactId, suggestions });
        setGenerated(true);
        router.refresh();
      } catch (err) {
        setGenerateError(err instanceof Error ? err.message : "Generation failed");
      }
    });
  }

  function handleGenerateVariants() {
    const selectedSuggestions = flatSuggestions
      .filter((s) => selected.has(s.index))
      .map((s) => ({ text: s.text, agentName: s.agentName }));

    if (selectedSuggestions.length === 0) return;

    setGenerateError(null);
    startGenerate(async () => {
      try {
        await generateSelectedVariants({ artifactId, suggestions: selectedSuggestions });
        setGenerated(true);
        router.refresh();
      } catch (err) {
        setGenerateError(err instanceof Error ? err.message : "Generation failed");
      }
    });
  }

  const autoSelectCount = flatSuggestions.filter(
    (s) => s.expectedImpactScore >= AUTO_SELECT_THRESHOLD
  ).length;

  return (
    <section
      data-testid="multi-agent-critique-panel"
      className="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] p-5 flex flex-col gap-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-medium text-neutral-200">
            Multi-agent critique
          </span>
          <span className="text-[10px] text-neutral-600 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1.5 py-0.5">
            Claude + Grok
          </span>
        </div>

        {!critiques && (
          <button
            onClick={handleRequestCritique}
            disabled={isCritiquing}
            data-testid="request-critique-btn"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-950/40 border border-violet-700/40 text-violet-300 hover:bg-violet-900/40 hover:border-violet-600/50 transition-colors disabled:opacity-50"
          >
            {isCritiquing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            {isCritiquing ? "Analyzing…" : "Request critique"}
          </button>
        )}
      </div>

      {critiqueError && (
        <p className="text-[11px] text-red-400">{critiqueError}</p>
      )}

      {/* Suggestion selection list */}
      {critiques && flatSuggestions.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">
              Select suggestions to generate as variants
            </p>

            {/* Auto-select button — visible once scoring has run */}
            {scoredSuggestions && autoSelectCount > 0 && !generated && (
              <button
                onClick={handleAutoSelect}
                data-testid="auto-select-btn"
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium bg-teal-950/40 border border-teal-700/40 text-teal-300 hover:bg-teal-900/40 hover:border-teal-600/50 transition-colors"
              >
                <Zap className="h-2.5 w-2.5" />
                Auto-select {autoSelectCount} high-impact
              </button>
            )}
          </div>

          {flatSuggestions.map((s) => (
            <label
              key={s.index}
              data-testid={`suggestion-${s.index}`}
              className={[
                "flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors",
                selected.has(s.index)
                  ? "border-violet-700/60 bg-violet-950/20"
                  : "border-[#2a2a2a] bg-[#111111] hover:border-[#3a3a3a]",
              ].join(" ")}
            >
              <input
                type="checkbox"
                checked={selected.has(s.index)}
                onChange={() => toggleSelection(s.index)}
                className="mt-0.5 accent-violet-500 flex-shrink-0"
                aria-label={s.text}
              />
              <span className="flex-1 text-[11px] text-neutral-300 leading-snug min-w-0">
                {s.text}
              </span>
              <div className="flex items-center gap-1 flex-shrink-0">
                <span
                  className={`text-[9px] font-medium px-1.5 py-0.5 rounded border ${agentBadgeClass(
                    s.agentName
                  )}`}
                >
                  {s.agentName}
                </span>
                <span
                  data-testid={`priority-badge-${s.index}`}
                  className={`text-[9px] font-medium px-1.5 py-0.5 rounded border ${priorityBadgeClass(
                    s.priority
                  )}`}
                >
                  P{s.priority}
                </span>
                <span
                  data-testid={`score-pill-${s.index}`}
                  className="text-[9px] text-neutral-500 font-mono bg-[#1a1a1a] border border-[#2a2a2a] px-1 py-0.5 rounded"
                >
                  {s.finalScore.toFixed(2)}
                </span>
                {/* Impact score pill — only rendered after scoring */}
                {scoredSuggestions && (
                  <span
                    data-testid={`impact-pill-${s.index}`}
                    className={`text-[9px] font-mono px-1 py-0.5 rounded border ${impactBadgeClass(
                      s.expectedImpactScore
                    )}`}
                    title={`Relevance: ${s.relevanceScore.toFixed(2)} · Safety: ${s.safetyScore.toFixed(2)}`}
                  >
                    ⚡{s.expectedImpactScore.toFixed(2)}
                  </span>
                )}
              </div>
            </label>
          ))}

          {/* Coordinate button */}
          {!merged && (
            <div className="pt-1">
              <button
                onClick={handleCoordinateCritiques}
                disabled={isCoordinating || isScoring}
                data-testid="coordinate-critiques-btn"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-950/40 border border-indigo-700/40 text-indigo-300 hover:bg-indigo-900/40 hover:border-indigo-600/50 transition-colors disabled:opacity-50"
              >
                {isCoordinating || isScoring ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <GitMerge className="h-3 w-3" />
                )}
                {isCoordinating
                  ? "Coordinating…"
                  : isScoring
                  ? "Scoring…"
                  : "Coordinate critiques"}
              </button>
              {coordinateError && (
                <p className="text-[11px] text-red-400 mt-1">{coordinateError}</p>
              )}
              {scoreError && (
                <p className="text-[11px] text-amber-400 mt-1">{scoreError}</p>
              )}
            </div>
          )}

          {/* Merged critique result */}
          {merged && (
            <div
              data-testid="merged-critique-result"
              className="rounded-lg border border-indigo-800/30 bg-indigo-950/10 p-3 flex flex-col gap-2"
            >
              <p className="text-[10px] font-medium text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                <GitMerge className="h-3 w-3" />
                Coordinated by {merged.mergedBy}
                {merged.topAgentName && merged.topAgentName !== merged.mergedBy && (
                  <span className="ml-1 text-indigo-600 normal-case">
                    · led by {merged.topAgentName}
                  </span>
                )}
              </p>
              <div className="flex flex-col gap-1.5">
                {merged.weightedSuggestions.map((ws, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <p className="text-[11px] text-neutral-300 leading-snug flex-1">
                      • {ws.text}
                    </p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {ws.contributors.length > 1 && (
                        <span className="text-[8px] text-indigo-600 font-mono bg-indigo-950/40 border border-indigo-800/30 px-1 py-0.5 rounded">
                          ×{ws.contributors.length}
                        </span>
                      )}
                      <span
                        data-testid={`merged-score-${i}`}
                        className="text-[9px] font-mono text-indigo-500 bg-indigo-950/40 border border-indigo-800/30 px-1 py-0.5 rounded"
                      >
                        {ws.score.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={handleUseMerged}
                disabled={isGenerating || generated}
                data-testid="use-merged-btn"
                className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-950/40 border border-indigo-700/40 text-indigo-300 hover:bg-indigo-900/40 hover:border-indigo-600/50 transition-colors disabled:opacity-50 mt-1"
              >
                {isGenerating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <GitMerge className="h-3 w-3" />
                )}
                {generated ? "Variants generated" : "Use merged"}
              </button>
            </div>
          )}

          {/* iKhaya MANCE council panel — advisory, never decisive */}
          {(isMancing || manceResult) && (
            <div
              data-testid="mance-council-panel"
              className="rounded-lg border border-violet-800/30 bg-violet-950/10 p-3 flex flex-col gap-2"
            >
              <p className="text-[10px] font-medium text-violet-400 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                iKhaya council — advisory
              </p>
              {isMancing && !manceResult && (
                <div className="flex items-center gap-1.5 text-[11px] text-violet-500">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  The council is deliberating…
                </div>
              )}
              {manceResult && (
                <div className="flex flex-col gap-2">
                  {manceResult.deliberation_transcript.map((entry, i) => (
                    <div key={i} className="flex flex-col gap-0.5">
                      <span className="text-[9px] font-medium text-violet-500 uppercase tracking-wider">
                        {entry.agent}
                      </span>
                      <p className="text-[11px] text-neutral-400 leading-snug">
                        {entry.statement}
                      </p>
                    </div>
                  ))}
                  <div className="border-t border-violet-800/20 pt-2 flex flex-col gap-1">
                    <p className="text-[11px] text-violet-300 leading-snug">
                      {manceResult.consensus_summary}
                    </p>
                    <p className="text-[10px] text-violet-500 italic">
                      Council recommends: {manceResult.recommended_action}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Generate button */}
          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <button
              onClick={handleGenerateVariants}
              disabled={isGenerating || selected.size === 0 || generated}
              data-testid="generate-variants-btn"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-950/40 border border-emerald-700/40 text-emerald-300 hover:bg-emerald-900/40 hover:border-emerald-600/50 transition-colors disabled:opacity-50"
            >
              {isGenerating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckSquare className="h-3 w-3" />
              )}
              {isGenerating
                ? "Generating…"
                : generated
                ? "Variants generated"
                : `Generate ${selected.size || ""} variant${
                    selected.size !== 1 ? "s" : ""
                  }`}
            </button>

            {selected.size > 0 && !isGenerating && !generated && (
              <span className="text-[10px] text-neutral-600">
                {selected.size} of {flatSuggestions.length} selected
              </span>
            )}
          </div>

          {generateError && (
            <p className="text-[11px] text-red-400">{generateError}</p>
          )}

          {generated && (
            <p className="text-[11px] text-emerald-500">
              Variants created — scroll down to review them.
            </p>
          )}
        </div>
      )}

      {critiques && flatSuggestions.length === 0 && (
        <p className="text-[11px] text-neutral-600">
          No suggestions returned from agents.
        </p>
      )}

      {!critiques && !isCritiquing && (
        <p className="text-[11px] text-neutral-600 leading-relaxed">
          Run a parallel critique using Claude and a Grok stub. Select the
          suggestions you want to materialise as editable variants.
        </p>
      )}
    </section>
  );
}
