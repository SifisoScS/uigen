"use client";

import { useState } from "react";
import { Brain, ChevronDown, ChevronRight, Palette } from "lucide-react";

interface StyleSignature {
  colors?: string[];
  spacing?: string[];
}

interface Props {
  semanticSummary: string | null;
  componentTree: Record<string, unknown> | null;
  styleSignature: StyleSignature | null;
}

function CollapsibleJSON({
  label,
  data,
}: {
  label: string;
  data: Record<string, unknown>;
}) {
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

export function ArtifactIntrospection({
  semanticSummary,
  componentTree,
  styleSignature,
}: Props) {
  const hasAny = semanticSummary || componentTree || styleSignature;
  if (!hasAny) return null;

  const colors = styleSignature?.colors ?? [];
  const spacing = styleSignature?.spacing ?? [];

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
        <Brain className="h-3.5 w-3.5" />
        Introspection
      </h2>

      {/* Semantic summary */}
      {semanticSummary && (
        <div
          className="px-4 py-3 rounded-lg border border-[#2a2a2a] bg-[#111111]"
          data-testid="semantic-summary"
        >
          <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 font-medium">
            Semantic summary
          </p>
          <p className="text-sm text-neutral-200 leading-relaxed">
            {semanticSummary}
          </p>
        </div>
      )}

      {/* Component tree */}
      {componentTree && (
        <div data-testid="component-tree">
          <CollapsibleJSON label="component tree" data={componentTree} />
        </div>
      )}

      {/* Style signature */}
      {(colors.length > 0 || spacing.length > 0) && (
        <div
          className="rounded-lg border border-[#2a2a2a] bg-[#111111] px-4 py-3 space-y-3"
          data-testid="style-signature"
        >
          <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium flex items-center gap-1.5">
            <Palette className="h-3.5 w-3.5" />
            Style signature
          </p>
          {colors.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {colors.map((c) => (
                <span
                  key={c}
                  className="px-2 py-0.5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] text-[11px] font-mono text-violet-300"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
          {spacing.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {spacing.map((s) => (
                <span
                  key={s}
                  className="px-2 py-0.5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] text-[11px] font-mono text-neutral-500"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
