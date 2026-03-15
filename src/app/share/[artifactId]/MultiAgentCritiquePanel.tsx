"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Sparkles, Loader2, CheckSquare, GitMerge } from "lucide-react";
import { critiqueArtifact, type AggregatedCritique } from "@/actions/critique-artifact";
import { generateSelectedVariants } from "@/actions/generate-selected-variants";
import { coordinateCritiques, type MergedCritique } from "@/actions/coordinate-critiques";

interface FlatSuggestion {
  text: string;
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

export function MultiAgentCritiquePanel({ artifactId }: { artifactId: string }) {
  const router = useRouter();
  const [critiques, setCritiques] = useState<AggregatedCritique[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [critiqueError, setCritiqueError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [coordinateError, setCoordinateError] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);
  const [merged, setMerged] = useState<MergedCritique | null>(null);
  const [isCritiquing, startCritique] = useTransition();
  const [isGenerating, startGenerate] = useTransition();
  const [isCoordinating, startCoordinate] = useTransition();

  // Flatten all agent suggestions into a stable indexed list
  // critiques arrive pre-sorted by finalScore descending from the server action
  const flatSuggestions: FlatSuggestion[] = critiques
    ? critiques.flatMap((c, agentIdx) =>
        c.suggestions.map((text, suggIdx) => ({
          text,
          agentName: c.agentName,
          priority: c.priority,
          finalScore: c.finalScore,
          index: agentIdx * 1000 + suggIdx,
        }))
      )
    : [];

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

  function handleCoordinateCritiques() {
    if (!critiques) return;
    setCoordinateError(null);
    startCoordinate(async () => {
      try {
        const result = await coordinateCritiques({ artifactId, agentCritiques: critiques });
        setMerged(result.mergedCritique);
      } catch (err) {
        setCoordinateError(err instanceof Error ? err.message : "Coordination failed");
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
          <p className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">
            Select suggestions to generate as variants
          </p>

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
              </div>
            </label>
          ))}

          {/* Coordinate button */}
          {!merged && (
            <div className="pt-1">
              <button
                onClick={handleCoordinateCritiques}
                disabled={isCoordinating}
                data-testid="coordinate-critiques-btn"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-950/40 border border-indigo-700/40 text-indigo-300 hover:bg-indigo-900/40 hover:border-indigo-600/50 transition-colors disabled:opacity-50"
              >
                {isCoordinating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <GitMerge className="h-3 w-3" />
                )}
                {isCoordinating ? "Coordinating…" : "Coordinate critiques"}
              </button>
              {coordinateError && (
                <p className="text-[11px] text-red-400 mt-1">{coordinateError}</p>
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
              </p>
              <div className="flex flex-col gap-1">
                {merged.suggestions.map((s, i) => (
                  <p key={i} className="text-[11px] text-neutral-300 leading-snug">
                    • {s}
                  </p>
                ))}
              </div>
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
