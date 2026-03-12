"use client";

import { useState } from "react";
import Link from "next/link";
import { GitFork, ChevronDown, ChevronRight, CornerDownRight } from "lucide-react";
import type { ArtifactSummary } from "@/actions/get-artifact-lineage";

interface AncestryChainProps {
  parent: ArtifactSummary | null;
  remixedInto: ArtifactSummary[];
}

const PREVIEW_COUNT = 3;

export function AncestryChain({ parent, remixedInto }: AncestryChainProps) {
  const [childrenExpanded, setChildrenExpanded] = useState(false);

  if (!parent && remixedInto.length === 0) return null;

  const visibleChildren = childrenExpanded
    ? remixedInto
    : remixedInto.slice(0, PREVIEW_COUNT);
  const hiddenCount = remixedInto.length - PREVIEW_COUNT;

  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#0d0d0d] divide-y divide-[#1f1f1f] overflow-hidden">
      {/* Parent */}
      {parent && (
        <div className="flex items-center gap-2 px-4 py-3">
          <GitFork className="h-3.5 w-3.5 text-neutral-600 flex-shrink-0" />
          <span className="text-xs text-neutral-500">Remixed from</span>
          <Link
            href={`/share/${parent.id}`}
            className="text-xs font-medium text-blue-400 hover:text-blue-300 truncate"
          >
            {parent.name}
          </Link>
          <span className="text-[10px] font-mono text-neutral-600 flex-shrink-0">
            v{parent.version}
          </span>
        </div>
      )}

      {/* Remixed into */}
      {remixedInto.length > 0 && (
        <div className="px-4 py-3 space-y-2">
          <button
            onClick={() => setChildrenExpanded((v) => !v)}
            className="flex items-center gap-2 text-xs text-neutral-500 hover:text-neutral-300 transition-colors w-full text-left"
          >
            <GitFork className="h-3.5 w-3.5 flex-shrink-0" />
            <span>
              Remixed into{" "}
              <span className="text-neutral-300 font-medium">
                {remixedInto.length}
              </span>{" "}
              artifact{remixedInto.length !== 1 ? "s" : ""}
            </span>
            {remixedInto.length > PREVIEW_COUNT &&
              (childrenExpanded ? (
                <ChevronDown className="h-3 w-3 ml-auto" />
              ) : (
                <ChevronRight className="h-3 w-3 ml-auto" />
              ))}
          </button>

          <div className="space-y-1 pl-5">
            {visibleChildren.map((child) => (
              <div key={child.id} className="flex items-center gap-1.5">
                <CornerDownRight className="h-3 w-3 text-neutral-700 flex-shrink-0" />
                <Link
                  href={`/share/${child.id}`}
                  className="text-xs text-blue-400 hover:text-blue-300 truncate"
                >
                  {child.name}
                </Link>
                <span className="text-[10px] font-mono text-neutral-600 flex-shrink-0">
                  v{child.version}
                </span>
              </div>
            ))}

            {!childrenExpanded && hiddenCount > 0 && (
              <button
                onClick={() => setChildrenExpanded(true)}
                className="text-[10px] text-neutral-600 hover:text-neutral-400 transition-colors pl-4"
              >
                + {hiddenCount} more
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
