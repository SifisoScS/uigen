"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  History, RotateCcw, GitFork, Loader2, RefreshCw,
  GitCompare, Pin, PinOff, GitBranch, X, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { getSnapshots } from "@/actions/get-snapshots";
import { restoreSnapshot } from "@/actions/restore-snapshot";
import { forkSnapshot } from "@/actions/fork-snapshot";
import { updateSnapshot } from "@/actions/update-snapshot";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useFileSystem } from "@/lib/contexts/file-system-context";
import { SnapshotDiffModal } from "@/components/SnapshotDiffModal";
import { cn } from "@/lib/utils";

interface Snapshot {
  id: string;
  label: string;
  name: string | null;
  tags: string[];
  pinned: boolean;
  forkCount: number;
  createdAt: Date;
}

interface DiffSpec {
  beforeId: string;
  beforeLabel: string;
  afterTarget: "current" | string;
  afterLabel: string;
}

interface SnapshotTimelineProps {
  projectId: string;
  generationCount: number;
}

function relativeTime(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return "just now";
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "yesterday";
  return `${diffDays}d ago`;
}

function displayName(snap: Snapshot): string {
  return snap.name?.trim() || snap.label;
}

export function SnapshotTimeline({ projectId, generationCount }: SnapshotTimelineProps) {
  const router = useRouter();
  const { getAllFiles } = useFileSystem();

  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingRestore, setPendingRestore] = useState<string | null>(null);
  const [pendingFork, setPendingFork] = useState<string | null>(null);
  const [diffSpec, setDiffSpec] = useState<DiffSpec | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [tagInputId, setTagInputId] = useState<string | null>(null);
  const [tagInputValue, setTagInputValue] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);

  const fetchSnapshots = useCallback(async () => {
    try {
      const data = await getSnapshots(projectId);
      setSnapshots(data);
    } catch {
      // silently fail — user may not be owner
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    fetchSnapshots();
  }, [fetchSnapshots, generationCount]);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  useEffect(() => {
    if (tagInputId) tagInputRef.current?.focus();
  }, [tagInputId]);

  function patchSnapshot(id: string, patch: Partial<Snapshot>) {
    setSnapshots((prev) => {
      const updated = prev.map((s) => (s.id === id ? { ...s, ...patch } : s));
      return [...updated].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    });
  }

  async function handleRestore(snapshotId: string) {
    if (pendingRestore !== snapshotId) { setPendingRestore(snapshotId); return; }
    setPendingRestore(null);
    try {
      const { projectId: pid } = await restoreSnapshot(snapshotId);
      toast.success("Restored to checkpoint — reloading…");
      window.location.href = `/${pid}`;
    } catch {
      toast.error("Restore failed. Please try again.");
    }
  }

  async function handleFork(snap: Snapshot) {
    setPendingFork(snap.id);
    try {
      const forked = await forkSnapshot(snap.id);
      patchSnapshot(snap.id, { forkCount: snap.forkCount + 1 });
      toast.success("Forked from checkpoint!");
      router.push(`/${forked.id}`);
    } catch {
      toast.error("Fork failed. Please try again.");
    } finally {
      setPendingFork(null);
    }
  }

  async function handleTogglePin(snap: Snapshot) {
    const next = !snap.pinned;
    patchSnapshot(snap.id, { pinned: next });
    try {
      await updateSnapshot({ snapshotId: snap.id, pinned: next });
    } catch {
      patchSnapshot(snap.id, { pinned: snap.pinned });
      toast.error("Failed to update pin state.");
    }
  }

  function startRename(snap: Snapshot) {
    setTagInputId(null);
    setRenamingId(snap.id);
    setRenameValue(snap.name ?? "");
  }

  async function commitRename(snap: Snapshot) {
    setRenamingId(null);
    const trimmed = renameValue.trim() || null;
    if (trimmed === (snap.name ?? null)) return;
    patchSnapshot(snap.id, { name: trimmed });
    try {
      await updateSnapshot({ snapshotId: snap.id, name: trimmed });
    } catch {
      patchSnapshot(snap.id, { name: snap.name });
      toast.error("Failed to rename checkpoint.");
    }
  }

  function openTagInput(snapId: string) {
    setRenamingId(null);
    setTagInputId(snapId);
    setTagInputValue("");
  }

  async function addTag(snap: Snapshot, rawTag: string) {
    const tag = rawTag.trim().toLowerCase().replace(/\s+/g, "-");
    if (!tag || snap.tags.includes(tag)) return;
    const next = [...snap.tags, tag];
    patchSnapshot(snap.id, { tags: next });
    setTagInputValue("");
    try {
      await updateSnapshot({ snapshotId: snap.id, tags: next });
    } catch {
      patchSnapshot(snap.id, { tags: snap.tags });
      toast.error("Failed to add tag.");
    }
  }

  async function removeTag(snap: Snapshot, tag: string) {
    const next = snap.tags.filter((t) => t !== tag);
    patchSnapshot(snap.id, { tags: next });
    try {
      await updateSnapshot({ snapshotId: snap.id, tags: next });
    } catch {
      patchSnapshot(snap.id, { tags: snap.tags });
      toast.error("Failed to remove tag.");
    }
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>, snap: Snapshot) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(snap, tagInputValue);
    } else if (e.key === "Escape") {
      setTagInputId(null);
    }
  }

  // Chronological order ignoring pin state — for correct "vs. prev" lookup
  const chronological = [...snapshots].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  function getPrevSnapshot(snap: Snapshot): Snapshot | null {
    const idx = chronological.findIndex((s) => s.id === snap.id);
    return chronological[idx + 1] ?? null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-neutral-600" />
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="px-3 py-6 text-center">
        <History className="h-5 w-5 text-neutral-700 mx-auto mb-2" />
        <p className="text-[11px] text-neutral-600 leading-relaxed">
          No checkpoints yet. History is recorded automatically after each generation.
        </p>
      </div>
    );
  }

  return (
    <>
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-2 py-1 space-y-0.5">
          {snapshots.map((snap) => {
            const isRestoringThis = pendingRestore === snap.id;
            const isForkingThis = pendingFork === snap.id;
            const isRenamingThis = renamingId === snap.id;
            const isTaggingThis = tagInputId === snap.id;
            const prevSnap = getPrevSnapshot(snap);

            return (
              <div
                key={snap.id}
                className={cn(
                  "group rounded-md px-2 py-2 transition-colors",
                  snap.pinned
                    ? "bg-[#161616] hover:bg-[#1c1c1c] border border-[#232323]"
                    : "hover:bg-[#1a1a1a]"
                )}
              >
                {/* Label */}
                <div className="flex items-start gap-1 mb-0.5">
                  {snap.pinned && (
                    <Pin className="h-2.5 w-2.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  )}
                  {isRenamingThis ? (
                    <input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => commitRename(snap)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(snap);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      placeholder={snap.label}
                      className="flex-1 text-[11px] bg-[#252525] border border-[#333] rounded px-1.5 py-0.5 text-neutral-200 outline-none focus:border-blue-600/60 min-w-0"
                    />
                  ) : (
                    <p
                      className="flex-1 text-[11px] text-neutral-300 truncate leading-tight cursor-text hover:text-neutral-100 transition-colors"
                      title={`${displayName(snap)} — click to rename`}
                      onClick={() => startRename(snap)}
                    >
                      {displayName(snap)}
                    </p>
                  )}
                </div>

                {/* Time + fork badge */}
                <div className="flex items-center gap-1.5 mb-1.5">
                  <p className="text-[10px] text-neutral-600">{relativeTime(snap.createdAt)}</p>
                  {snap.forkCount > 0 && (
                    <span
                      className="inline-flex items-center gap-0.5 text-[10px] text-neutral-500"
                      title={`Forked ${snap.forkCount} time${snap.forkCount > 1 ? "s" : ""}`}
                    >
                      <GitBranch className="h-2.5 w-2.5" />
                      {snap.forkCount}
                    </span>
                  )}
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {snap.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-0.5 px-1.5 py-px rounded-full bg-[#1e1e1e] border border-[#2e2e2e] text-[9px] text-neutral-400"
                    >
                      {tag}
                      <button
                        onClick={() => removeTag(snap, tag)}
                        className="text-neutral-600 hover:text-neutral-300 transition-colors ml-0.5"
                      >
                        <X className="h-2 w-2" />
                      </button>
                    </span>
                  ))}
                  {isTaggingThis ? (
                    <input
                      ref={tagInputRef}
                      value={tagInputValue}
                      onChange={(e) => setTagInputValue(e.target.value)}
                      onKeyDown={(e) => handleTagKeyDown(e, snap)}
                      onBlur={() => {
                        if (tagInputValue.trim()) addTag(snap, tagInputValue);
                        setTagInputId(null);
                      }}
                      placeholder="tag…"
                      className="w-14 text-[9px] bg-transparent border-b border-[#444] text-neutral-300 outline-none placeholder-neutral-700"
                    />
                  ) : (
                    <button
                      onClick={() => openTagInput(snap.id)}
                      className="inline-flex items-center justify-center w-4 h-4 rounded-full text-neutral-700 hover:text-neutral-400 hover:bg-[#252525] transition-colors"
                      title="Add tag"
                    >
                      <Plus className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>

                {/* Hover actions */}
                <div className="flex items-center gap-1 flex-wrap opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleRestore(snap.id)}
                    className={cn(
                      "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                      isRestoringThis
                        ? "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30"
                        : "bg-[#252525] text-neutral-400 hover:text-neutral-200 hover:bg-[#2e2e2e]"
                    )}
                    title={isRestoringThis ? "Click again to confirm" : "Restore to this checkpoint"}
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    {isRestoringThis ? "Confirm?" : "Restore"}
                  </button>

                  <button
                    onClick={() => handleFork(snap)}
                    disabled={isForkingThis}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[#252525] text-neutral-400 hover:text-neutral-200 hover:bg-[#2e2e2e] transition-colors disabled:opacity-50"
                    title="Fork project from this checkpoint"
                  >
                    {isForkingThis ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <GitFork className="h-2.5 w-2.5" />}
                    Fork
                  </button>

                  <button
                    onClick={() => setDiffSpec({ beforeId: snap.id, beforeLabel: displayName(snap), afterTarget: "current", afterLabel: "Current" })}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[#252525] text-neutral-400 hover:text-neutral-200 hover:bg-[#2e2e2e] transition-colors"
                    title="Compare this checkpoint to the current state"
                  >
                    <GitCompare className="h-2.5 w-2.5" />
                    vs. now
                  </button>

                  {prevSnap && (
                    <button
                      onClick={() => setDiffSpec({ beforeId: prevSnap.id, beforeLabel: displayName(prevSnap), afterTarget: snap.id, afterLabel: displayName(snap) })}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[#252525] text-neutral-400 hover:text-neutral-200 hover:bg-[#2e2e2e] transition-colors"
                      title="Compare this checkpoint to the previous one"
                    >
                      <GitCompare className="h-2.5 w-2.5" />
                      vs. prev
                    </button>
                  )}

                  <button
                    onClick={() => handleTogglePin(snap)}
                    className={cn(
                      "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                      snap.pinned
                        ? "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                        : "bg-[#252525] text-neutral-400 hover:text-neutral-200 hover:bg-[#2e2e2e]"
                    )}
                    title={snap.pinned ? "Unpin checkpoint" : "Pin to top"}
                  >
                    {snap.pinned ? <PinOff className="h-2.5 w-2.5" /> : <Pin className="h-2.5 w-2.5" />}
                    {snap.pinned ? "Unpin" : "Pin"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {diffSpec && (
        <SnapshotDiffModal
          beforeId={diffSpec.beforeId}
          beforeLabel={diffSpec.beforeLabel}
          afterTarget={diffSpec.afterTarget}
          afterLabel={diffSpec.afterLabel}
          currentFiles={getAllFiles()}
          onClose={() => setDiffSpec(null)}
        />
      )}
    </>
  );
}

export function HistoryRefreshButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-1 rounded-md text-neutral-600 hover:text-neutral-400 hover:bg-[#1e1e1e] transition-colors"
      title="Refresh history"
    >
      <RefreshCw className="h-3.5 w-3.5" />
    </button>
  );
}
