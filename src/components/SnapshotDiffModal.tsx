"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Loader2, FileCode, GitCompare } from "lucide-react";
import { getSnapshot } from "@/actions/get-snapshot";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { FileNode } from "@/lib/file-system";

// ─── Diff types ───────────────────────────────────────────────────────────────

type DiffLineType = "add" | "remove" | "unchanged";

interface DiffLine {
  type: DiffLineType;
  content: string;
}

interface FileDiff {
  path: string;
  status: "added" | "removed" | "modified";
  lines: DiffLine[];
}

// ─── Diff engine ──────────────────────────────────────────────────────────────

/** LCS-based line diff. O(m*n) — fine for component files (<2k lines). */
function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const m = a.length;
  const n = b.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && a[i] === b[j]) {
      result.push({ type: "unchanged", content: a[i] });
      i++;
      j++;
    } else if (j < n && (i >= m || dp[i + 1][j] >= dp[i][j + 1])) {
      result.push({ type: "add", content: b[j] });
      j++;
    } else {
      result.push({ type: "remove", content: a[i] });
      i++;
    }
  }
  return result;
}

function extractFiles(data: string): Map<string, string> {
  try {
    const nodes = JSON.parse(data) as Record<string, FileNode>;
    const map = new Map<string, string>();
    for (const [path, node] of Object.entries(nodes)) {
      if (node.type === "file") {
        map.set(path, node.content ?? "");
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

function computeDiffs(
  filesA: Map<string, string>,
  filesB: Map<string, string>
): FileDiff[] {
  const allPaths = new Set([...filesA.keys(), ...filesB.keys()]);
  const diffs: FileDiff[] = [];

  for (const path of [...allPaths].sort()) {
    const a = filesA.get(path);
    const b = filesB.get(path);

    if (a === undefined) {
      diffs.push({
        path,
        status: "added",
        lines: (b ?? "").split("\n").map((l) => ({ type: "add", content: l })),
      });
    } else if (b === undefined) {
      diffs.push({
        path,
        status: "removed",
        lines: a.split("\n").map((l) => ({ type: "remove", content: l })),
      });
    } else if (a !== b) {
      diffs.push({ path, status: "modified", lines: diffLines(a, b) });
    }
  }

  return diffs;
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface SnapshotDiffModalProps {
  /** Older snapshot (the "before" side). */
  beforeId: string;
  beforeLabel: string;
  /** Newer side: 'current' for live files, or a snapshot ID. */
  afterTarget: "current" | string;
  afterLabel: string;
  /** Live file system state — only read when afterTarget === 'current'. */
  currentFiles: Map<string, string>;
  onClose: () => void;
}

const STATUS_ICON: Record<FileDiff["status"], string> = {
  added: "+",
  removed: "−",
  modified: "~",
};

const STATUS_COLOR: Record<FileDiff["status"], string> = {
  added: "text-emerald-400",
  removed: "text-red-400",
  modified: "text-yellow-400",
};

export function SnapshotDiffModal({
  beforeId,
  beforeLabel,
  afterTarget,
  afterLabel,
  currentFiles,
  onClose,
}: SnapshotDiffModalProps) {
  const [diffs, setDiffs] = useState<FileDiff[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const snapA = await getSnapshot(beforeId);
      const filesA = extractFiles(snapA.data);

      let filesB: Map<string, string>;
      if (afterTarget === "current") {
        filesB = currentFiles;
      } else {
        const snapB = await getSnapshot(afterTarget);
        filesB = extractFiles(snapB.data);
      }

      const computed = computeDiffs(filesA, filesB);
      setDiffs(computed);
      setSelectedFile(computed[0]?.path ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load diff");
    } finally {
      setLoading(false);
    }
  }, [beforeId, afterTarget, currentFiles]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedDiff = diffs.find((d) => d.path === selectedFile);
  const title = `${beforeLabel} → ${afterLabel}`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-5xl h-[82vh] bg-[#141414] border border-[#252525] rounded-xl flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-[#1f1f1f] flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <GitCompare className="h-4 w-4 text-neutral-500 flex-shrink-0" />
            <span
              className="text-sm text-neutral-300 font-medium truncate"
              title={title}
            >
              {title}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-neutral-600 hover:text-neutral-300 hover:bg-[#1e1e1e] transition-colors flex-shrink-0 ml-4"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-600" />
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        ) : diffs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2">
            <GitCompare className="h-8 w-8 text-neutral-700" />
            <p className="text-sm text-neutral-500">No differences found</p>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* File list */}
            <div className="w-56 flex-shrink-0 border-r border-[#1f1f1f] flex flex-col">
              <div className="px-3 py-2 border-b border-[#1f1f1f] flex-shrink-0">
                <p className="text-[10px] text-neutral-600 uppercase tracking-wider font-medium">
                  Changed files ({diffs.length})
                </p>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-1.5 space-y-0.5">
                  {diffs.map((d) => (
                    <button
                      key={d.path}
                      onClick={() => setSelectedFile(d.path)}
                      className={cn(
                        "w-full text-left px-2 py-1.5 rounded-md flex items-center gap-1.5 transition-colors",
                        selectedFile === d.path
                          ? "bg-[#1e1e1e] text-neutral-200"
                          : "text-neutral-500 hover:text-neutral-300 hover:bg-[#181818]"
                      )}
                    >
                      <span
                        className={cn(
                          "text-[10px] font-bold w-3 flex-shrink-0",
                          STATUS_COLOR[d.status]
                        )}
                      >
                        {STATUS_ICON[d.status]}
                      </span>
                      <span className="text-[11px] truncate font-mono">
                        {d.path.replace(/^\//, "")}
                      </span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Diff viewer */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
              {selectedDiff && (
                <>
                  <div className="px-4 py-2 border-b border-[#1f1f1f] flex-shrink-0 flex items-center gap-2">
                    <FileCode className="h-3.5 w-3.5 text-neutral-600 flex-shrink-0" />
                    <span className="text-[11px] text-neutral-500 font-mono truncate">
                      {selectedDiff.path}
                    </span>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="font-mono text-[12px] leading-5 overflow-x-auto">
                      <DiffView lines={selectedDiff.lines} />
                    </div>
                  </ScrollArea>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Separate component to keep line-number counters clean
function DiffView({ lines }: { lines: DiffLine[] }) {
  let lineA = 1;
  let lineB = 1;

  return (
    <table className="w-full border-collapse">
      <tbody>
        {lines.map((line, idx) => {
          const numA = line.type !== "add" ? lineA : null;
          const numB = line.type !== "remove" ? lineB : null;
          if (line.type !== "add") lineA++;
          if (line.type !== "remove") lineB++;

          return (
            <tr
              key={idx}
              className={cn(
                line.type === "add" && "bg-emerald-950/40",
                line.type === "remove" && "bg-red-950/40"
              )}
            >
              {/* Line numbers */}
              <td className="w-9 text-right pr-2 text-neutral-700 text-[11px] select-none border-r border-[#1f1f1f] align-top py-px pl-2 tabular-nums">
                {numA ?? ""}
              </td>
              <td className="w-9 text-right pr-2 text-neutral-700 text-[11px] select-none border-r border-[#1f1f1f] align-top py-px tabular-nums">
                {numB ?? ""}
              </td>
              {/* Sign */}
              <td
                className={cn(
                  "w-5 text-center text-[12px] select-none align-top py-px",
                  line.type === "add" && "text-emerald-400",
                  line.type === "remove" && "text-red-400",
                  line.type === "unchanged" && "text-neutral-700"
                )}
              >
                {line.type === "add" ? "+" : line.type === "remove" ? "−" : " "}
              </td>
              {/* Content */}
              <td
                className={cn(
                  "px-2 py-px align-top whitespace-pre",
                  line.type === "add" && "text-emerald-200",
                  line.type === "remove" && "text-red-300",
                  line.type === "unchanged" && "text-neutral-400"
                )}
              >
                {line.content}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
