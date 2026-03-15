"use client";

import { useState } from "react";
import { Brain, ChevronDown, ChevronRight, Palette, Layers, Puzzle } from "lucide-react";

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

// ── Component tree view ───────────────────────────────────────────────────────

interface ComponentTreeNode {
  type: string;
  name?: string;
  props?: Record<string, string>;
  children?: ComponentTreeNode[];
  _source?: string;
  _stub?: boolean;
}

function TreeNode({ node, depth }: { node: ComponentTreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const name = node.name ?? node.type ?? "?";
  const hasChildren = (node.children ?? []).length > 0;
  const isRegistry = /^[A-Z]/.test(name);
  const props = Object.entries(node.props ?? {}).slice(0, 3);

  return (
    <div style={{ paddingLeft: depth > 0 ? 12 : 0 }}>
      <div
        className={[
          "flex items-center gap-0.5 rounded px-1 py-0.5 font-mono text-[10px] leading-snug",
          hasChildren ? "cursor-pointer hover:bg-[#181818]" : "",
        ].join(" ")}
        onClick={hasChildren ? () => setOpen((o) => !o) : undefined}
        data-testid={depth === 0 ? "tree-node-root" : undefined}
      >
        {hasChildren ? (
          open
            ? <ChevronDown className="h-2.5 w-2.5 flex-shrink-0 text-neutral-600" />
            : <ChevronRight className="h-2.5 w-2.5 flex-shrink-0 text-neutral-600" />
        ) : (
          <span className="w-2.5 flex-shrink-0" />
        )}
        <span className={isRegistry ? "text-violet-400" : "text-blue-400"}>
          &lt;{name}
        </span>
        {props.map(([k, v]) => (
          <span key={k} className="text-neutral-500">
            {" "}{k}
            {v !== "true" && (
              <span className="text-amber-500/80">
                =&quot;{v.slice(0, 30)}&quot;
              </span>
            )}
          </span>
        ))}
        {Object.keys(node.props ?? {}).length > 3 && (
          <span className="text-neutral-600"> …</span>
        )}
        <span className={isRegistry ? "text-violet-400" : "text-blue-400"}>&gt;</span>
      </div>
      {open && hasChildren && (
        <div>
          {(node.children ?? []).map((child, i) => (
            <TreeNode key={i} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface StyleSignature {
  classes?: string[];
  colors?: string[];
  spacing?: string[];
  usedComponents?: string[];
  propSummary?: Record<string, string[]>;
}

interface Props {
  semanticSummary: string | null;
  componentTree: Record<string, unknown> | null;
  styleSignature: StyleSignature | null;
}

export function ArtifactIntrospection({ semanticSummary, componentTree, styleSignature }: Props) {
  const colors         = styleSignature?.colors         ?? [];
  const spacing        = styleSignature?.spacing        ?? [];
  const classes        = styleSignature?.classes        ?? [];
  const usedComponents = styleSignature?.usedComponents ?? [];
  const propSummary    = styleSignature?.propSummary    ?? {};
  const hasStyle       = colors.length > 0 || spacing.length > 0 || classes.length > 0;
  const treeNode       = componentTree as ComponentTreeNode | null;
  const hasTree        = treeNode && !treeNode._stub;

  if (!semanticSummary && !hasTree && !hasStyle && usedComponents.length === 0) return null;

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

      {/* Used components */}
      {usedComponents.length > 0 && (
        <div
          className="rounded-lg border border-[#2a2a2a] bg-[#111111] px-4 py-3 space-y-2"
          data-testid="used-components"
        >
          <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium flex items-center gap-1.5">
            <Puzzle className="h-3.5 w-3.5" />
            Used components
          </p>
          <div className="flex flex-wrap gap-1.5">
            {usedComponents.map((comp) => {
              const props = propSummary[comp];
              return (
                <span
                  key={comp}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-950/40 border border-violet-800/40 text-violet-300 text-[11px] font-mono"
                  title={props ? `props: ${props.join(", ")}` : undefined}
                >
                  {comp}
                  {props && props.length > 0 && (
                    <span className="text-violet-600 text-[9px]">
                      ({props.slice(0, 3).join(", ")}{props.length > 3 ? "…" : ""})
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Component tree */}
      {hasTree && (
        <div
          className="rounded-lg border border-[#2a2a2a] bg-[#0c0c0c] overflow-hidden"
          data-testid="component-tree"
        >
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[#1f1f1f]">
            <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-medium">
              Component tree
            </span>
            {treeNode?._source && (
              <span className="ml-auto text-[9px] font-mono text-neutral-600">
                {String(treeNode._source)}
              </span>
            )}
          </div>
          <div className="px-3 py-3">
            <TreeNode node={treeNode!} depth={0} />
          </div>
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
