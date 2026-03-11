"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { History, RotateCcw, GitFork, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getSnapshots } from "@/actions/get-snapshots";
import { restoreSnapshot } from "@/actions/restore-snapshot";
import { forkSnapshot } from "@/actions/fork-snapshot";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface Snapshot {
  id: string;
  label: string;
  createdAt: Date;
}

interface SnapshotTimelineProps {
  projectId: string;
  /** Increments each time the chat stream finishes so the list auto-refreshes */
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

export function SnapshotTimeline({ projectId, generationCount }: SnapshotTimelineProps) {
  const router = useRouter();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingRestore, setPendingRestore] = useState<string | null>(null);
  const [pendingFork, setPendingFork] = useState<string | null>(null);

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

  // Initial load + refresh after each generation
  useEffect(() => {
    setLoading(true);
    fetchSnapshots();
  }, [fetchSnapshots, generationCount]);

  async function handleRestore(snapshotId: string) {
    // First click sets pending; second click confirms
    if (pendingRestore !== snapshotId) {
      setPendingRestore(snapshotId);
      return;
    }

    setPendingRestore(null);
    try {
      const { projectId: pid } = await restoreSnapshot(snapshotId);
      toast.success("Restored to checkpoint — reloading…");
      // Full navigation to re-hydrate providers with restored data
      window.location.href = `/${pid}`;
    } catch {
      toast.error("Restore failed. Please try again.");
    }
  }

  async function handleFork(snapshotId: string) {
    setPendingFork(snapshotId);
    try {
      const forked = await forkSnapshot(snapshotId);
      toast.success("Forked from checkpoint!");
      router.push(`/${forked.id}`);
    } catch {
      toast.error("Fork failed. Please try again.");
    } finally {
      setPendingFork(null);
    }
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
    <ScrollArea className="flex-1 min-h-0">
      <div className="px-2 py-1 space-y-0.5">
        {snapshots.map((snap) => {
          const isRestoringThis = pendingRestore === snap.id;
          const isForkingThis = pendingFork === snap.id;

          return (
            <div
              key={snap.id}
              className="group rounded-md px-2 py-2 hover:bg-[#1a1a1a] transition-colors"
            >
              {/* Label + time */}
              <p
                className="text-[11px] text-neutral-300 truncate leading-tight mb-1"
                title={snap.label}
              >
                {snap.label}
              </p>
              <p className="text-[10px] text-neutral-600 mb-1.5">
                {relativeTime(snap.createdAt)}
              </p>

              {/* Actions — visible on hover */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleRestore(snap.id)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                    isRestoringThis
                      ? "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30"
                      : "bg-[#252525] text-neutral-400 hover:text-neutral-200 hover:bg-[#2e2e2e]"
                  )}
                  title={isRestoringThis ? "Click again to confirm restore" : "Restore to this checkpoint"}
                >
                  <RotateCcw className="h-2.5 w-2.5" />
                  {isRestoringThis ? "Confirm?" : "Restore"}
                </button>

                <button
                  onClick={() => handleFork(snap.id)}
                  disabled={isForkingThis}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[#252525] text-neutral-400 hover:text-neutral-200 hover:bg-[#2e2e2e] transition-colors disabled:opacity-50"
                  title="Fork project from this checkpoint"
                >
                  {isForkingThis ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : (
                    <GitFork className="h-2.5 w-2.5" />
                  )}
                  Fork
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

// Compact trigger button used in the sidebar header area
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
