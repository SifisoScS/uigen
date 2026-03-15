"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle } from "lucide-react";
import { resolveVariantConflict } from "@/actions/resolve-variant-conflict";
import type { ConflictingFile, Resolution } from "@/lib/virtual-fs-utils";

interface Props {
  originalArtifactId: string;
  variantProjectId: string;
  conflictingFiles: ConflictingFile[];
  onResolved: (mergedAt: Date) => void;
}

export function ConflictResolution({
  originalArtifactId,
  variantProjectId,
  conflictingFiles,
  onResolved,
}: Props) {
  const [choices, setChoices] = useState<Record<string, "original" | "variant">>(
    () => Object.fromEntries(conflictingFiles.map((f) => [f.path, "original"]))
  );
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setChoice(path: string, choice: "original" | "variant") {
    setChoices((prev) => ({ ...prev, [path]: choice }));
  }

  async function handleSubmit() {
    setIsPending(true);
    setError(null);
    try {
      const resolutions: Resolution[] = Object.entries(choices).map(
        ([path, choice]) => ({ path, choice })
      );
      const result = await resolveVariantConflict({
        originalArtifactId,
        variantProjectId,
        resolutions,
      });
      onResolved(result.mergedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resolution failed");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div data-testid="conflict-resolution" className="flex flex-col gap-3 mt-2">
      <div className="flex items-center gap-2 text-amber-400 text-xs font-medium">
        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
        {conflictingFiles.length} file conflict
        {conflictingFiles.length !== 1 ? "s" : ""} detected — choose which version to keep
      </div>

      {conflictingFiles.map((file) => {
        const safePath = file.path.replace(/\//g, "-");
        return (
          <div
            key={file.path}
            data-testid={`conflict-file-${safePath}`}
            className="rounded-lg border border-amber-800/30 bg-amber-950/10 overflow-hidden"
          >
            <div className="px-3 py-1.5 border-b border-amber-800/20">
              <span className="text-[10px] font-mono text-amber-400/80 truncate block">
                {file.path}
              </span>
            </div>

            <div className="grid grid-cols-2 divide-x divide-[#2a2a2a]">
              {/* Original */}
              <div className="flex flex-col">
                <div className="px-2 py-1 flex items-center justify-between gap-2 border-b border-[#1a1a1a]">
                  <span className="text-[9px] text-neutral-600 font-medium uppercase tracking-wider">
                    Original
                  </span>
                  <button
                    onClick={() => setChoice(file.path, "original")}
                    data-testid={`keep-original-${safePath}`}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
                      choices[file.path] === "original"
                        ? "bg-blue-950/60 border border-blue-700/60 text-blue-300"
                        : "bg-[#1a1a1a] border border-[#2a2a2a] text-neutral-500 hover:border-[#3a3a3a] hover:text-neutral-400"
                    }`}
                  >
                    {choices[file.path] === "original" && (
                      <CheckCircle className="h-2 w-2" />
                    )}
                    Keep
                  </button>
                </div>
                <pre className="p-2 text-[8px] leading-relaxed text-neutral-500 overflow-auto max-h-32 font-mono whitespace-pre-wrap break-all">
                  {file.originalContent.slice(0, 300)}
                  {file.originalContent.length > 300 ? "…" : ""}
                </pre>
              </div>

              {/* Variant */}
              <div className="flex flex-col">
                <div className="px-2 py-1 flex items-center justify-between gap-2 border-b border-[#1a1a1a]">
                  <span className="text-[9px] text-neutral-600 font-medium uppercase tracking-wider">
                    Variant
                  </span>
                  <button
                    onClick={() => setChoice(file.path, "variant")}
                    data-testid={`take-variant-${safePath}`}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
                      choices[file.path] === "variant"
                        ? "bg-emerald-950/60 border border-emerald-700/60 text-emerald-300"
                        : "bg-[#1a1a1a] border border-[#2a2a2a] text-neutral-500 hover:border-[#3a3a3a] hover:text-neutral-400"
                    }`}
                  >
                    {choices[file.path] === "variant" && (
                      <CheckCircle className="h-2 w-2" />
                    )}
                    Take
                  </button>
                </div>
                <pre className="p-2 text-[8px] leading-relaxed text-neutral-500 overflow-auto max-h-32 font-mono whitespace-pre-wrap break-all">
                  {file.variantContent.slice(0, 300)}
                  {file.variantContent.length > 300 ? "…" : ""}
                </pre>
              </div>
            </div>
          </div>
        );
      })}

      {error && <p className="text-[10px] text-red-400">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={isPending}
        data-testid="resolve-conflicts-btn"
        className="flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-medium bg-amber-950/40 border border-amber-700/40 text-amber-400 hover:bg-amber-900/40 hover:border-amber-600/50 transition-colors disabled:opacity-50 w-fit"
      >
        {isPending ? "Resolving…" : "Apply resolutions & merge"}
      </button>
    </div>
  );
}
