"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle, Zap } from "lucide-react";
import { DiffEditor } from "@monaco-editor/react";
import { resolveVariantConflict } from "@/actions/resolve-variant-conflict";
import type { ConflictingFile, Resolution } from "@/lib/virtual-fs-utils";

interface Props {
  originalArtifactId: string;
  variantProjectId: string;
  conflictingFiles: ConflictingFile[];
  onResolved: (mergedAt: Date) => void;
}

type Choice = "original" | "variant" | "manual";

interface MonacoModifiedEditor {
  getValue(): string;
  setValue(value: string): void;
}

export function ConflictResolution({
  originalArtifactId,
  variantProjectId,
  conflictingFiles,
  onResolved,
}: Props) {
  const [choices, setChoices] = useState<Record<string, Choice>>(
    () => Object.fromEntries(conflictingFiles.map((f) => [f.path, "variant"]))
  );
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRefs = useRef<Record<string, MonacoModifiedEditor | null>>({});

  function handleKeepOriginal(path: string, content: string) {
    setChoices((prev) => ({ ...prev, [path]: "original" }));
    editorRefs.current[path]?.setValue(content);
  }

  function handleTakeVariant(path: string, content: string) {
    setChoices((prev) => ({ ...prev, [path]: "variant" }));
    editorRefs.current[path]?.setValue(content);
  }

  function handleAutoMerge() {
    const next: Record<string, Choice> = {};
    for (const f of conflictingFiles) {
      next[f.path] = "variant";
      editorRefs.current[f.path]?.setValue(f.variantContent);
    }
    setChoices(next);
  }

  async function handleSubmit() {
    setIsPending(true);
    setError(null);
    try {
      const resolutions: Resolution[] = conflictingFiles.map((f) => ({
        path: f.path,
        resolvedContent: editorRefs.current[f.path]?.getValue() ?? f.variantContent,
      }));
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
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-amber-400 text-xs font-medium">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          {conflictingFiles.length} file conflict
          {conflictingFiles.length !== 1 ? "s" : ""} detected
        </div>

        <button
          onClick={handleAutoMerge}
          data-testid="auto-merge-btn"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-indigo-950/40 border border-indigo-700/40 text-indigo-300 hover:bg-indigo-900/40 hover:border-indigo-600/50 transition-colors"
        >
          <Zap className="h-3 w-3" />
          Auto-merge all (take variant)
        </button>
      </div>

      {conflictingFiles.map((file) => {
        const safePath = file.path.replace(/\//g, "-");
        const choice = choices[file.path] ?? "variant";
        return (
          <div
            key={file.path}
            data-testid={`conflict-file-${safePath}`}
            className="rounded-lg border border-amber-800/30 bg-amber-950/10 overflow-hidden"
          >
            <div className="px-3 py-1.5 border-b border-amber-800/20 flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono text-amber-400/80 truncate">
                {file.path}
              </span>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => handleKeepOriginal(file.path, file.originalContent)}
                  data-testid={`keep-original-${safePath}`}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
                    choice === "original"
                      ? "bg-blue-950/60 border border-blue-700/60 text-blue-300"
                      : "bg-[#1a1a1a] border border-[#2a2a2a] text-neutral-500 hover:border-[#3a3a3a] hover:text-neutral-400"
                  }`}
                >
                  {choice === "original" && <CheckCircle className="h-2 w-2" />}
                  Keep original
                </button>
                <button
                  onClick={() => handleTakeVariant(file.path, file.variantContent)}
                  data-testid={`take-variant-${safePath}`}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
                    choice === "variant"
                      ? "bg-emerald-950/60 border border-emerald-700/60 text-emerald-300"
                      : "bg-[#1a1a1a] border border-[#2a2a2a] text-neutral-500 hover:border-[#3a3a3a] hover:text-neutral-400"
                  }`}
                >
                  {choice === "variant" && <CheckCircle className="h-2 w-2" />}
                  Take variant
                </button>
              </div>
            </div>

            <div
              data-testid={`monaco-diff-${safePath}`}
              className="h-60"
            >
              <DiffEditor
                height="100%"
                theme="vs-dark"
                original={file.originalContent}
                modified={file.variantContent}
                language="typescript"
                options={{
                  readOnly: false,
                  renderSideBySide: true,
                  minimap: { enabled: false },
                  fontSize: 11,
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                }}
                onMount={(diffEditor) => {
                  const modifiedEditor = diffEditor.getModifiedEditor() as MonacoModifiedEditor;
                  editorRefs.current[file.path] = modifiedEditor;
                  // Track manual edits via the underlying editor model
                  (modifiedEditor as unknown as { onDidChangeModelContent: (cb: () => void) => void })
                    .onDidChangeModelContent(() => {
                      setChoices((prev) => ({ ...prev, [file.path]: "manual" }));
                    });
                }}
              />
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
