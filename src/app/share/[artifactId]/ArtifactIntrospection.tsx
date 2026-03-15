"use client";

import { useState } from "react";
import { Brain, ChevronDown, ChevronRight, Palette, Layers } from "lucide-react";

// ── Color swatch helper ───────────────────────────────────────────────────────

const TAILWIND_HEX: Record<string, string> = {
  slate: "#64748b", gray: "#6b7280", zinc: "#71717a", neutral: "#737373",
  stone: "#78716c", red: "#ef4444", orange: "#f97316", amber: "#f59e0b",
  yellow: "#eab308", lime: "#84cc16", green: "#22c55e", emerald: "#10b981",
  teal: "#14b8a6", cyan: "#06b6d4", sky: "#0ea5e9", blue: "#3b82f6",
  indigo: "#6366f1", violet: "#8b5cf6", purple: "#a855f7", fuchsia: "#d946ef",
  pink: "#ec4899", rose: "#f43f5e",
};

function colorToHex(cls: string): string | null {
  const m = cls.match(/(?:bg|text|border|ring|from|to|via)-([a-z]+)-\d+/);
  return m ? (TAILWIND_HEX[m[1]] ?? null) : null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CollapsibleJSON({ label, data }: { label: string; data: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#0c0c0c] overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-neutral-400 hover:text-neutral-200 hover:bg-[#181818] transition-colors"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
        )}
        {open ? "Hide" : "Show"} {label}
        <span className="ml-auto text-[10px] text-neutral-600 font-mono">
          {Object.keys(data).length} keys
        </span>
      </button>
      {open && (
        <pre className="px-4 py-3 text-[11px] text-neutral-300 font-mono overflow-x-auto border-t border-[#1f1f1f] leading-relaxed whitespace-pre-wrap break-words">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface StyleSignature {
  classes?: string[];
  colors?: string[];
  spacing?: string[];
}

interface Props {
  semanticSummary: string | null;
  componentTree: Record<string, unknown> | null;
  styleSignature: StyleSignature | null;
}

export function ArtifactIntrospection({ semanticSummary, componentTree, styleSignature }: Props) {
  const colors  = styleSignature?.colors  ?? [];
  const spacing = styleSignature?.spacing ?? [];
  const classes = styleSignature?.classes ?? [];
  const hasStyle = colors.length > 0 || spacing.length > 0 || classes.length > 0;
  if (!semanticSummary && !componentTree && !hasStyle) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
        <Brain className="h-3.5 w-3.5" />
        Introspection
      </h2>

      {/* Semantic summary */}
      {semanticSummary && (
        <div className="px-4 py-3 rounded-lg border border-[#2a2a2a] bg-[#111111]" data-testid="semantic-summary">
          <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 font-medium">
            Semantic summary
          </p>
          <p className="text-sm text-neutral-200 leading-relaxed">{semanticSummary}</p>
        </div>
      )}

      {/* Component tree */}
      {componentTree && (
        <div data-testid="component-tree">
          <CollapsibleJSON label="component tree" data={componentTree} />
        </div>
      )}

      {/* Style signature */}
      {hasStyle && (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#111111] px-4 py-3 space-y-3" data-testid="style-signature">
          <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium flex items-center gap-1.5">
            <Palette className="h-3.5 w-3.5" />
            Style signature
          </p>

          {/* Color swatches */}
          {colors.length > 0 && (
            <div className="flex flex-wrap gap-2" data-testid="color-swatches">
              {colors.map((c) => {
                const hex = colorToHex(c);
                return (
                  <span key={c} className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] text-[11px] font-mono text-neutral-300">
                    {hex && (
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-white/10"
                        style={{ background: hex }}
                        aria-hidden
                      />
                    )}
                    {c}
                  </span>
                );
              })}
            </div>
          )}

          {/* Spacing tags */}
          {spacing.length > 0 && (
            <div className="flex flex-wrap gap-1.5" data-testid="spacing-tags">
              {spacing.map((s) => (
                <span key={s} className="px-2 py-0.5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] text-[11px] font-mono text-neutral-500">
                  {s}
                </span>
              ))}
            </div>
          )}

          {/* Utility class tags */}
          {classes.length > 0 && (
            <div className="flex flex-wrap gap-1.5" data-testid="class-tags">
              <p className="w-full text-[10px] text-neutral-600 uppercase tracking-wider flex items-center gap-1">
                <Layers className="h-2.5 w-2.5" />
                Classes
              </p>
              {classes.map((c) => (
                <span key={c} className="px-2 py-0.5 rounded-full bg-[#1a1a1a] border border-[#282828] text-[11px] font-mono text-neutral-600">
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
