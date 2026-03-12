"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  X, Network, ZoomIn, ZoomOut, RefreshCw,
  GitBranch, Pin, RotateCcw, GitFork, GitCompare,
  Tag, GitMerge,
} from "lucide-react";
import { toast } from "sonner";
import { getSnapshots } from "@/actions/get-snapshots";
import { getSnapshot } from "@/actions/get-snapshot";
import { restoreSnapshot } from "@/actions/restore-snapshot";
import { forkSnapshot } from "@/actions/fork-snapshot";
import { updateSnapshot } from "@/actions/update-snapshot";
import { setBranch } from "@/actions/set-branch";
import { renameBranch } from "@/actions/rename-branch";
import { useFileSystem } from "@/lib/contexts/file-system-context";
import { SnapshotDiffModal } from "@/components/SnapshotDiffModal";
import {
  branchColor,
  branchColorDim,
  branchColorBg,
  branchColorBorder,
} from "@/lib/branch-colors";
import { cn } from "@/lib/utils";
import type { FileNode } from "@/lib/file-system";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Snapshot {
  id: string;
  label: string;
  name: string | null;
  tags: string[];
  pinned: boolean;
  forkCount: number;
  branchName: string | null;
  isVersionTag: boolean;
  mergedFromSnapshotId: string | null;
  createdAt: Date;
}

interface DiffSpec {
  beforeId: string;
  beforeLabel: string;
  afterTarget: "current" | string;
  afterLabel: string;
}

interface ChangeSummary {
  added: number;
  removed: number;
  modified: number;
}

export interface VersionGraphProps {
  projectId: string;
  generationCount: number;
  onClose: () => void;
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const NODE_W = 172;
const NODE_H = 88;
const H_GAP = 60;
const H_MARGIN = 60;
const V_CENTER = 100; // top-y of nodes

function nodeX(i: number) {
  return H_MARGIN + i * (NODE_W + H_GAP);
}

function nodeCenterY() {
  return V_CENTER + NODE_H / 2;
}

function mergeArcPath(srcIdx: number, dstIdx: number): string {
  const x1 = nodeX(srcIdx) + NODE_W;
  const x2 = nodeX(dstIdx);
  const y = nodeCenterY();
  const arcH = 44 + Math.abs(dstIdx - srcIdx) * 8;
  const yCtrl = V_CENTER - arcH;
  return `M ${x1},${y} C ${x1},${yCtrl} ${x2},${yCtrl} ${x2},${y}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function displayName(snap: Snapshot): string {
  return snap.name?.trim() || snap.label;
}

function extractFiles(data: string): Map<string, string> {
  try {
    const nodes = JSON.parse(data) as Record<string, FileNode>;
    const map = new Map<string, string>();
    for (const [path, node] of Object.entries(nodes)) {
      if (node.type === "file") map.set(path, node.content ?? "");
    }
    return map;
  } catch {
    return new Map();
  }
}

function fileChangeSummary(
  before: Map<string, string>,
  after: Map<string, string>
): ChangeSummary {
  let added = 0, removed = 0, modified = 0;
  for (const [path, content] of after) {
    if (!before.has(path)) added++;
    else if (before.get(path) !== content) modified++;
  }
  for (const path of before.keys()) {
    if (!after.has(path)) removed++;
  }
  return { added, removed, modified };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VersionGraph({ projectId, generationCount, onClose }: VersionGraphProps) {
  const router = useRouter();
  const { getAllFiles } = useFileSystem();

  // ── Data ──────────────────────────────────────────────────────────────────
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSnapshots = useCallback(async () => {
    try {
      const data = await getSnapshots(projectId);
      setSnapshots(data);
    } catch {
      // may not be owner
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots, generationCount]);

  // Oldest left → newest right
  const chronological = useMemo(
    () =>
      [...snapshots].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    [snapshots]
  );

  // Merge edges: each snap with mergedFromSnapshotId that is found in this project
  const mergeEdges = useMemo(() => {
    return chronological
      .filter((s) => s.mergedFromSnapshotId !== null)
      .flatMap((s) => {
        const dstIdx = chronological.findIndex((c) => c.id === s.id);
        const srcIdx = chronological.findIndex(
          (c) => c.id === s.mergedFromSnapshotId
        );
        if (srcIdx === -1) return [];
        return [{ srcId: s.mergedFromSnapshotId!, dstId: s.id, srcIdx, dstIdx }];
      });
  }, [chronological]);

  // ── Zoom / Pan ────────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  zoomRef.current = zoom;
  panRef.current = pan;
  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.3, Math.min(2.5, zoomRef.current * factor));
    const ratio = newZoom / zoomRef.current;
    const newPan = {
      x: cx - (cx - panRef.current.x) * ratio,
      y: cy - (cy - panRef.current.y) * ratio,
    };
    setZoom(newZoom);
    setPan(newPan);
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const tag = (e.target as Element).tagName;
    if (tag !== "svg" && tag !== "rect" && tag !== "path" && tag !== "circle")
      return;
    dragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  }, []);

  const stopDrag = useCallback(() => {
    dragging.current = false;
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // ── Primary interaction state ─────────────────────────────────────────────
  const [menuId, setMenuId] = useState<string | null>(null);
  const [selectA, setSelectA] = useState<string | null>(null);
  const [diffSpec, setDiffSpec] = useState<DiffSpec | null>(null);
  const [pendingRestore, setPendingRestore] = useState<string | null>(null);
  const [pendingFork, setPendingFork] = useState<string | null>(null);

  // ── Hover diff (node) ─────────────────────────────────────────────────────
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const dataCache = useRef<Map<string, Map<string, string>>>(new Map());
  const [hoverSummary, setHoverSummary] = useState<{
    id: string;
    summary: ChangeSummary;
  } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getFiles = useCallback(async (id: string) => {
    if (dataCache.current.has(id)) return dataCache.current.get(id)!;
    const s = await getSnapshot(id);
    const files = extractFiles(s.data);
    dataCache.current.set(id, files);
    return files;
  }, []);

  const loadNodeSummary = useCallback(
    async (snap: Snapshot, prevSnap: Snapshot | undefined) => {
      try {
        const afterFiles = await getFiles(snap.id);
        const beforeFiles = prevSnap ? await getFiles(prevSnap.id) : new Map<string, string>();
        setHoverSummary({ id: snap.id, summary: fileChangeSummary(beforeFiles, afterFiles) });
      } catch { /* ignore */ }
    },
    [getFiles]
  );

  const handleNodeHoverEnter = useCallback(
    (snap: Snapshot, prevSnap: Snapshot | undefined) => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      setHoveredId(snap.id);
      hoverTimer.current = setTimeout(() => loadNodeSummary(snap, prevSnap), 250);
    },
    [loadNodeSummary]
  );

  const handleNodeHoverLeave = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHoveredId(null);
    setHoverSummary(null);
  }, []);

  // ── Context menu (right-click) ────────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, snap: Snapshot) => {
      e.preventDefault();
      e.stopPropagation();
      setMenuId(null);
      setCtxMenu({ id: snap.id, x: e.clientX, y: e.clientY });
    },
    []
  );

  // ── Branch input overlay ──────────────────────────────────────────────────
  const [branchInput, setBranchInput] = useState<{
    id: string;
    mode: "create" | "rename";
    value: string;
    x: number;
    y: number;
  } | null>(null);
  const branchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (branchInput) branchInputRef.current?.focus();
  }, [branchInput]);

  const openBranchInput = useCallback(
    (snap: Snapshot, mode: "create" | "rename", x: number, y: number) => {
      setCtxMenu(null);
      setBranchInput({
        id: snap.id,
        mode,
        value: mode === "rename" ? (snap.branchName ?? "") : "",
        x,
        y,
      });
    },
    []
  );

  const commitBranch = useCallback(async () => {
    if (!branchInput) return;
    const name = branchInput.value.trim();
    setBranchInput(null);
    if (!name) return;

    const snap = chronological.find((s) => s.id === branchInput.id);
    if (!snap) return;
    const snapIdx = chronological.findIndex((s) => s.id === snap.id);

    if (branchInput.mode === "create") {
      // Optimistic: set this + subsequent null-branch snapshots
      setSnapshots((prev) =>
        prev.map((s) => {
          const idx = chronological.findIndex((c) => c.id === s.id);
          if (s.id === snap.id) return { ...s, branchName: name };
          if (idx > snapIdx && s.branchName === null) return { ...s, branchName: name };
          return s;
        })
      );
      try {
        await setBranch(snap.id, name);
        toast.success(`Branch "${name}" created`);
      } catch {
        fetchSnapshots();
        toast.error("Failed to create branch");
      }
    } else {
      // Rename: update all snapshots with old branch name
      const oldName = snap.branchName;
      if (!oldName) return;
      setSnapshots((prev) =>
        prev.map((s) =>
          s.branchName === oldName ? { ...s, branchName: name } : s
        )
      );
      try {
        await renameBranch(projectId, oldName, name);
        toast.success(`Branch renamed to "${name}"`);
      } catch {
        fetchSnapshots();
        toast.error("Failed to rename branch");
      }
    }
  }, [branchInput, chronological, fetchSnapshots, projectId]);

  const handleEndBranch = useCallback(
    async (snap: Snapshot) => {
      setCtxMenu(null);
      const oldBranch = snap.branchName;
      if (!oldBranch) return;
      const snapIdx = chronological.findIndex((s) => s.id === snap.id);
      // Optimistic
      setSnapshots((prev) =>
        prev.map((s) => {
          const idx = chronological.findIndex((c) => c.id === s.id);
          if (s.id === snap.id) return { ...s, branchName: null };
          if (idx > snapIdx && s.branchName === oldBranch) return { ...s, branchName: null };
          return s;
        })
      );
      try {
        await setBranch(snap.id, null);
        toast.success("Branch ended");
      } catch {
        fetchSnapshots();
        toast.error("Failed to end branch");
      }
    },
    [chronological, fetchSnapshots]
  );

  // ── Version tag toggle ────────────────────────────────────────────────────
  const handleToggleVersionTag = useCallback(async (snap: Snapshot) => {
    setCtxMenu(null);
    const next = !snap.isVersionTag;
    setSnapshots((prev) =>
      prev.map((s) => (s.id === snap.id ? { ...s, isVersionTag: next } : s))
    );
    try {
      await updateSnapshot({ snapshotId: snap.id, isVersionTag: next });
      toast.success(next ? "Version tag added" : "Version tag removed");
    } catch {
      setSnapshots((prev) =>
        prev.map((s) => (s.id === snap.id ? { ...s, isVersionTag: snap.isVersionTag } : s))
      );
      toast.error("Failed to update version tag");
    }
  }, []);

  // ── Merge marker ──────────────────────────────────────────────────────────
  const [mergePicker, setMergePicker] = useState<string | null>(null); // destId

  const handleSetMergeSource = useCallback(
    async (destId: string, sourceId: string) => {
      const dest = chronological.find((s) => s.id === destId);
      if (!dest) return;
      setSnapshots((prev) =>
        prev.map((s) =>
          s.id === destId ? { ...s, mergedFromSnapshotId: sourceId } : s
        )
      );
      try {
        await updateSnapshot({ snapshotId: destId, mergedFromSnapshotId: sourceId });
        toast.success("Merge marker set");
      } catch {
        setSnapshots((prev) =>
          prev.map((s) =>
            s.id === destId
              ? { ...s, mergedFromSnapshotId: dest.mergedFromSnapshotId }
              : s
          )
        );
        toast.error("Failed to set merge marker");
      }
    },
    [chronological]
  );

  const handleRemoveMerge = useCallback(async (snap: Snapshot) => {
    setCtxMenu(null);
    setSnapshots((prev) =>
      prev.map((s) =>
        s.id === snap.id ? { ...s, mergedFromSnapshotId: null } : s
      )
    );
    try {
      await updateSnapshot({ snapshotId: snap.id, mergedFromSnapshotId: null });
      toast.success("Merge marker removed");
    } catch {
      setSnapshots((prev) =>
        prev.map((s) =>
          s.id === snap.id ? { ...s, mergedFromSnapshotId: snap.mergedFromSnapshotId } : s
        )
      );
      toast.error("Failed to remove merge marker");
    }
  }, []);

  // ── Merge edge hover ──────────────────────────────────────────────────────
  const [mergeEdgeHover, setMergeEdgeHover] = useState<{
    srcId: string;
    dstId: string;
    x: number;
    y: number;
    summary?: ChangeSummary;
  } | null>(null);

  const handleMergeEdgeHover = useCallback(
    async (srcId: string, dstId: string, x: number, y: number) => {
      setMergeEdgeHover({ srcId, dstId, x, y });
      const cacheKey = `${srcId}→${dstId}`;
      if (dataCache.current.has(cacheKey)) {
        const summary = dataCache.current.get(cacheKey);
        // stored as a special summary marker
        setMergeEdgeHover((prev) =>
          prev ? { ...prev, summary: summary as unknown as ChangeSummary } : prev
        );
        return;
      }
      try {
        const [srcFiles, dstFiles] = await Promise.all([
          getFiles(srcId),
          getFiles(dstId),
        ]);
        const summary = fileChangeSummary(srcFiles, dstFiles);
        // Store in cache with a composite key
        dataCache.current.set(
          cacheKey,
          summary as unknown as Map<string, string>
        );
        setMergeEdgeHover((prev) =>
          prev ? { ...prev, summary } : prev
        );
      } catch { /* ignore */ }
    },
    [getFiles]
  );

  // ── Node click handler ────────────────────────────────────────────────────
  const handleNodeClick = useCallback(
    (e: React.MouseEvent, snap: Snapshot) => {
      e.stopPropagation();
      setCtxMenu(null);
      setBranchInput(null);

      // Merge picker mode
      if (mergePicker !== null) {
        if (snap.id !== mergePicker) {
          handleSetMergeSource(mergePicker, snap.id);
        }
        setMergePicker(null);
        return;
      }

      if (e.shiftKey) {
        if (!selectA) {
          setSelectA(snap.id);
        } else if (selectA !== snap.id) {
          const idxA = chronological.findIndex((s) => s.id === selectA);
          const idxB = chronological.findIndex((s) => s.id === snap.id);
          const [before, after] =
            idxA <= idxB
              ? [chronological[idxA], chronological[idxB]]
              : [chronological[idxB], chronological[idxA]];
          setDiffSpec({
            beforeId: before.id,
            beforeLabel: displayName(before),
            afterTarget: after.id,
            afterLabel: displayName(after),
          });
          setSelectA(null);
        }
        return;
      }

      setMenuId((prev) => (prev === snap.id ? null : snap.id));
    },
    [mergePicker, selectA, chronological, handleSetMergeSource]
  );

  // ── Action handlers ───────────────────────────────────────────────────────
  const handleRestore = useCallback(async (snapshotId: string) => {
    if (pendingRestore !== snapshotId) {
      setPendingRestore(snapshotId);
      return;
    }
    setPendingRestore(null);
    try {
      const { projectId: pid } = await restoreSnapshot(snapshotId);
      toast.success("Restored to checkpoint — reloading…");
      window.location.href = `/${pid}`;
    } catch {
      toast.error("Restore failed. Please try again.");
    }
  }, [pendingRestore]);

  const handleFork = useCallback(async (snap: Snapshot) => {
    setPendingFork(snap.id);
    setMenuId(null);
    try {
      const forked = await forkSnapshot(snap.id);
      toast.success("Forked from checkpoint!");
      router.push(`/${forked.id}`);
    } catch {
      toast.error("Fork failed. Please try again.");
    } finally {
      setPendingFork(null);
    }
  }, [router]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (diffSpec) { setDiffSpec(null); return; }
        if (branchInput) { setBranchInput(null); return; }
        if (ctxMenu) { setCtxMenu(null); return; }
        if (mergePicker) { setMergePicker(null); return; }
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, diffSpec, branchInput, ctxMenu, mergePicker]);

  // ── Diff modal ────────────────────────────────────────────────────────────
  if (diffSpec) {
    return (
      <SnapshotDiffModal
        beforeId={diffSpec.beforeId}
        beforeLabel={diffSpec.beforeLabel}
        afterTarget={diffSpec.afterTarget}
        afterLabel={diffSpec.afterLabel}
        currentFiles={getAllFiles()}
        onClose={() => setDiffSpec(null)}
      />
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex flex-col"
      onClick={() => {
        setMenuId(null);
        setCtxMenu(null);
        setBranchInput(null);
        setSelectA(null);
        if (mergePicker) setMergePicker(null);
      }}
    >
      {/* ── Header ── */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-[#1f1f1f] bg-[#111111] flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <Network className="h-4 w-4 text-neutral-500 flex-shrink-0" />
          <span className="text-sm text-neutral-200 font-medium">Version Graph</span>
          {!loading && (
            <span className="text-[11px] text-neutral-600">
              {chronological.length} checkpoint{chronological.length !== 1 ? "s" : ""}
            </span>
          )}
          {selectA && (
            <span className="text-[11px] text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full flex-shrink-0">
              Shift-click another node to compare
            </span>
          )}
          {mergePicker && (
            <span className="text-[11px] text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full flex-shrink-0 animate-pulse">
              Click the source node for this merge ↓
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}
            className="p-1.5 rounded text-neutral-600 hover:text-neutral-300 hover:bg-[#1e1e1e] transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))}
            className="p-1.5 rounded text-neutral-600 hover:text-neutral-300 hover:bg-[#1e1e1e] transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={resetView}
            className="p-1.5 rounded text-neutral-600 hover:text-neutral-300 hover:bg-[#1e1e1e] transition-colors"
            title="Reset view"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <div className="w-px h-4 bg-[#2a2a2a] mx-1" />
          <button
            onClick={onClose}
            className="p-1.5 rounded text-neutral-600 hover:text-neutral-300 hover:bg-[#1e1e1e] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div className="flex-1 overflow-hidden relative bg-[#0c0c0c]">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-5 w-5 rounded-full border-2 border-neutral-700 border-t-neutral-400 animate-spin" />
          </div>
        ) : chronological.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Network className="h-10 w-10 text-neutral-800" />
            <p className="text-sm text-neutral-600">No checkpoints yet</p>
          </div>
        ) : (
          <svg
            ref={svgRef}
            className="w-full h-full"
            style={{ cursor: dragging.current ? "grabbing" : "grab", userSelect: "none" }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={stopDrag}
            onMouseLeave={stopDrag}
          >
            <defs>
              {/* Dot-grid pattern */}
              <pattern id="vg-grid" width="28" height="28" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="0.9" fill="#1e1e1e" />
              </pattern>
              {/* Merge edge arrowhead */}
              <marker
                id="merge-arrow"
                markerWidth="6"
                markerHeight="5"
                refX="5"
                refY="2.5"
                orient="auto"
              >
                <path d="M 0 0 L 6 2.5 L 0 5 Z" fill="#8b5cf6" opacity="0.75" />
              </marker>
            </defs>

            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {/* Background grid */}
              <rect x={-10000} y={-10000} width={99999} height={99999} fill="url(#vg-grid)" />

              {/* ── Merge arcs (behind regular edges) ── */}
              {mergeEdges.map((edge) => (
                <g key={`merge-${edge.srcId}-${edge.dstId}`}>
                  {/* Visible arc */}
                  <path
                    d={mergeArcPath(edge.srcIdx, edge.dstIdx)}
                    fill="none"
                    stroke="#8b5cf6"
                    strokeWidth="1.5"
                    strokeDasharray="5 3"
                    markerEnd="url(#merge-arrow)"
                    opacity="0.55"
                    style={{ pointerEvents: "none" }}
                  />
                  {/* Wide invisible hit area */}
                  <path
                    d={mergeArcPath(edge.srcIdx, edge.dstIdx)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="12"
                    style={{ cursor: "pointer" }}
                    onClick={(e) => {
                      if (e.shiftKey) {
                        const src = chronological[edge.srcIdx];
                        const dst = chronological[edge.dstIdx];
                        if (src && dst) {
                          setDiffSpec({
                            beforeId: src.id,
                            beforeLabel: displayName(src),
                            afterTarget: dst.id,
                            afterLabel: displayName(dst),
                          });
                        }
                      }
                    }}
                    onMouseEnter={(e) =>
                      handleMergeEdgeHover(edge.srcId, edge.dstId, e.clientX, e.clientY)
                    }
                    onMouseLeave={() => setMergeEdgeHover(null)}
                  />
                </g>
              ))}

              {/* ── Regular edges ── */}
              {chronological.slice(0, -1).map((snap, i) => {
                const next = chronological[i + 1];
                const branch = snap.branchName || next.branchName;
                const stroke = branch ? branchColorDim(branch) : "#2a2a2a";
                const x1 = nodeX(i) + NODE_W;
                const x2 = nodeX(i + 1);
                const y = nodeCenterY();
                const mx = (x1 + x2) / 2;
                return (
                  <path
                    key={`edge-${snap.id}`}
                    d={`M ${x1},${y} C ${mx},${y} ${mx},${y} ${x2},${y}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth="2"
                    strokeLinecap="round"
                    style={{ pointerEvents: "none" }}
                  />
                );
              })}

              {/* ── Nodes ── */}
              {chronological.map((snap, i) => {
                const x = nodeX(i);
                const y = V_CENTER;
                const isHovered = hoveredId === snap.id;
                const isMenuOpen = menuId === snap.id;
                const isSelected = selectA === snap.id;
                const isMergeTarget = mergePicker !== null && mergePicker !== snap.id;
                const nodeSummary =
                  hoverSummary?.id === snap.id ? hoverSummary.summary : null;
                const hasSummary = isHovered && nodeSummary !== null;
                const nodeHActual = hasSummary ? NODE_H + 26 : NODE_H;

                // Border color
                let borderColor: string | undefined;
                if (isSelected) borderColor = "#3b82f6";
                else if (snap.isVersionTag) borderColor = "#d97706";
                else if (snap.branchName) borderColor = branchColorBorder(snap.branchName);

                return (
                  <g key={snap.id} transform={`translate(${x},${y})`}>
                    {/* Node card */}
                    <foreignObject
                      width={NODE_W}
                      height={nodeHActual}
                      style={{ overflow: "visible" }}
                    >
                      <div
                        className={cn(
                          "w-full rounded-lg border p-2.5 flex flex-col gap-1.5 cursor-pointer transition-all select-none",
                          isSelected
                            ? "bg-blue-950/50 shadow-lg shadow-blue-500/10"
                            : isMenuOpen || isHovered
                            ? "bg-[#1c1c1c] shadow-lg shadow-black/50"
                            : isMergeTarget
                            ? "bg-[#1a1017] hover:bg-[#201224]"
                            : "bg-[#151515]",
                          !borderColor && !isMenuOpen && !isHovered && !isSelected && "border-[#222]"
                        )}
                        style={{
                          fontFamily: "system-ui, sans-serif",
                          height: nodeHActual,
                          border: borderColor
                            ? `1px solid ${borderColor}`
                            : undefined,
                          boxShadow: snap.isVersionTag
                            ? `0 0 0 1px ${borderColor}, 0 0 12px ${borderColor}40`
                            : undefined,
                        }}
                        onMouseEnter={() =>
                          handleNodeHoverEnter(snap, chronological[i - 1])
                        }
                        onMouseLeave={handleNodeHoverLeave}
                        onClick={(e) =>
                          handleNodeClick(e as unknown as React.MouseEvent, snap)
                        }
                        onContextMenu={(e) =>
                          handleContextMenu(e as unknown as React.MouseEvent, snap)
                        }
                      >
                        {/* Top row: name + badges */}
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex-1 min-w-0">
                            <p
                              className={cn(
                                "text-[12px] font-medium truncate leading-tight",
                                snap.isVersionTag ? "text-amber-300" : "text-neutral-200"
                              )}
                            >
                              {snap.isVersionTag && (
                                <Tag className="h-2.5 w-2.5 inline mr-1 text-amber-400 flex-shrink-0" />
                              )}
                              {displayName(snap)}
                            </p>
                            <p className="text-[10px] text-neutral-600 mt-0.5 leading-tight">
                              {new Date(snap.createdAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                            {snap.mergedFromSnapshotId && (
                              <span title="Has merge source">
                                <GitMerge className="h-3 w-3 text-purple-400" />
                              </span>
                            )}
                            {snap.pinned && <Pin className="h-3 w-3 text-yellow-500" />}
                            {snap.forkCount > 0 && (
                              <span className="flex items-center gap-0.5 text-[9px] text-neutral-500 bg-[#222] px-1 py-0.5 rounded">
                                <GitBranch className="h-2.5 w-2.5" />
                                {snap.forkCount}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Branch pill */}
                        {snap.branchName && (
                          <span
                            className="self-start text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                            style={{
                              color: branchColor(snap.branchName),
                              background: branchColorBg(snap.branchName),
                            }}
                          >
                            {snap.branchName}
                          </span>
                        )}

                        {/* Tags */}
                        {snap.tags.length > 0 && (
                          <div className="flex flex-wrap gap-0.5">
                            {snap.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#222] text-neutral-500"
                              >
                                {tag}
                              </span>
                            ))}
                            {snap.tags.length > 3 && (
                              <span className="text-[9px] text-neutral-700">
                                +{snap.tags.length - 3}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Hover diff summary */}
                        {hasSummary && (
                          <div className="flex items-center gap-2 pt-1 border-t border-[#222]">
                            {nodeSummary.added > 0 && (
                              <span className="text-[10px] text-emerald-400 font-medium">
                                +{nodeSummary.added}
                              </span>
                            )}
                            {nodeSummary.modified > 0 && (
                              <span className="text-[10px] text-yellow-400 font-medium">
                                ~{nodeSummary.modified}
                              </span>
                            )}
                            {nodeSummary.removed > 0 && (
                              <span className="text-[10px] text-red-400 font-medium">
                                -{nodeSummary.removed}
                              </span>
                            )}
                            {nodeSummary.added === 0 &&
                              nodeSummary.modified === 0 &&
                              nodeSummary.removed === 0 && (
                                <span className="text-[10px] text-neutral-600">
                                  {i === 0 ? "initial" : "no changes"}
                                </span>
                              )}
                            <span className="text-[9px] text-neutral-700">files</span>
                          </div>
                        )}
                      </div>
                    </foreignObject>

                    {/* Left-click action menu */}
                    {isMenuOpen && (
                      <foreignObject
                        x={0}
                        y={NODE_H + 8}
                        width={NODE_W}
                        height={160}
                        style={{ overflow: "visible" }}
                      >
                        <div
                          className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-1 shadow-2xl shadow-black/70 flex flex-col gap-0.5"
                          style={{ fontFamily: "system-ui, sans-serif" }}
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                          <button
                            className={cn(
                              "w-full text-left text-[11px] px-2.5 py-1.5 rounded-md flex items-center gap-2 transition-colors",
                              pendingRestore === snap.id
                                ? "text-red-400 bg-red-950/30 hover:bg-red-950/50"
                                : "text-neutral-400 hover:text-neutral-200 hover:bg-[#222]"
                            )}
                            onClick={() => handleRestore(snap.id)}
                          >
                            <RotateCcw className="h-3 w-3 flex-shrink-0" />
                            {pendingRestore === snap.id
                              ? "Click again to confirm"
                              : "Restore to this"}
                          </button>
                          <button
                            className="w-full text-left text-[11px] text-neutral-400 hover:text-neutral-200 hover:bg-[#222] px-2.5 py-1.5 rounded-md flex items-center gap-2 transition-colors disabled:opacity-50"
                            disabled={pendingFork === snap.id}
                            onClick={() => handleFork(snap)}
                          >
                            <GitFork className="h-3 w-3 flex-shrink-0" />
                            {pendingFork === snap.id ? "Forking…" : "Fork from this"}
                          </button>
                          <div className="h-px bg-[#222] my-0.5" />
                          <button
                            className="w-full text-left text-[11px] text-neutral-400 hover:text-neutral-200 hover:bg-[#222] px-2.5 py-1.5 rounded-md flex items-center gap-2 transition-colors"
                            onClick={(e: React.MouseEvent) => {
                              e.stopPropagation();
                              setDiffSpec({
                                beforeId: snap.id,
                                beforeLabel: displayName(snap),
                                afterTarget: "current",
                                afterLabel: "current",
                              });
                              setMenuId(null);
                            }}
                          >
                            <GitCompare className="h-3 w-3 flex-shrink-0" />
                            Compare vs current
                          </button>
                          {i > 0 && (
                            <button
                              className="w-full text-left text-[11px] text-neutral-400 hover:text-neutral-200 hover:bg-[#222] px-2.5 py-1.5 rounded-md flex items-center gap-2 transition-colors"
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                const prev = chronological[i - 1];
                                setDiffSpec({
                                  beforeId: prev.id,
                                  beforeLabel: displayName(prev),
                                  afterTarget: snap.id,
                                  afterLabel: displayName(snap),
                                });
                                setMenuId(null);
                              }}
                            >
                              <GitCompare className="h-3 w-3 flex-shrink-0" />
                              Compare vs previous
                            </button>
                          )}
                        </div>
                      </foreignObject>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        )}

        {/* ── Merge edge hover tooltip ── */}
        {mergeEdgeHover && (
          <div
            className="fixed z-60 bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2 shadow-xl pointer-events-none"
            style={{
              left: mergeEdgeHover.x + 10,
              top: mergeEdgeHover.y - 40,
              transform: "translateY(-100%)",
            }}
          >
            <p className="text-[10px] text-neutral-500 mb-1">Merge edge</p>
            {mergeEdgeHover.summary ? (
              <div className="flex items-center gap-2">
                {mergeEdgeHover.summary.added > 0 && (
                  <span className="text-[11px] text-emerald-400 font-medium">
                    +{mergeEdgeHover.summary.added}
                  </span>
                )}
                {mergeEdgeHover.summary.modified > 0 && (
                  <span className="text-[11px] text-yellow-400 font-medium">
                    ~{mergeEdgeHover.summary.modified}
                  </span>
                )}
                {mergeEdgeHover.summary.removed > 0 && (
                  <span className="text-[11px] text-red-400 font-medium">
                    -{mergeEdgeHover.summary.removed}
                  </span>
                )}
                <span className="text-[10px] text-neutral-600">files · Shift+click to diff</span>
              </div>
            ) : (
              <span className="text-[11px] text-neutral-600">Loading…</span>
            )}
          </div>
        )}

        {/* ── Legend ── */}
        {!loading && chronological.length > 0 && (
          <div className="absolute bottom-4 right-4 flex items-center gap-3 text-[10px] text-neutral-700 pointer-events-none">
            <span>Click for actions</span>
            <span className="text-neutral-800">·</span>
            <span>Right-click for branch / tag / merge</span>
            <span className="text-neutral-800">·</span>
            <span>Shift+click two nodes to diff</span>
            <span className="text-neutral-800">·</span>
            <span>Scroll to zoom · drag to pan</span>
          </div>
        )}
      </div>

      {/* ── Right-click context menu ── */}
      {ctxMenu && (() => {
        const snap = chronological.find((s) => s.id === ctxMenu.id);
        if (!snap) return null;
        return (
          <div
            className="fixed z-[60] bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-1 shadow-2xl shadow-black/70 min-w-[180px]"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Branch section */}
            <div className="px-2 py-1">
              <p className="text-[9px] text-neutral-600 uppercase tracking-wider font-medium">
                Branch
              </p>
            </div>
            {!snap.branchName ? (
              <button
                className="w-full text-left text-[11px] text-neutral-400 hover:text-neutral-200 hover:bg-[#222] px-2.5 py-1.5 rounded-md flex items-center gap-2 transition-colors"
                onClick={() =>
                  openBranchInput(snap, "create", ctxMenu.x, ctxMenu.y)
                }
              >
                <GitBranch className="h-3 w-3 flex-shrink-0 text-neutral-500" />
                Create branch from here
              </button>
            ) : (
              <>
                <button
                  className="w-full text-left text-[11px] text-neutral-400 hover:text-neutral-200 hover:bg-[#222] px-2.5 py-1.5 rounded-md flex items-center gap-2 transition-colors"
                  onClick={() =>
                    openBranchInput(snap, "rename", ctxMenu.x, ctxMenu.y)
                  }
                >
                  <GitBranch className="h-3 w-3 flex-shrink-0" style={{ color: branchColor(snap.branchName) }} />
                  Rename "{snap.branchName}"
                </button>
                <button
                  className="w-full text-left text-[11px] text-neutral-400 hover:text-neutral-200 hover:bg-[#222] px-2.5 py-1.5 rounded-md flex items-center gap-2 transition-colors"
                  onClick={() => handleEndBranch(snap)}
                >
                  <X className="h-3 w-3 flex-shrink-0 text-neutral-500" />
                  End branch here
                </button>
              </>
            )}
            <div className="h-px bg-[#242424] my-1" />
            {/* Version tag */}
            <div className="px-2 py-1">
              <p className="text-[9px] text-neutral-600 uppercase tracking-wider font-medium">
                Version tag
              </p>
            </div>
            <button
              className="w-full text-left text-[11px] px-2.5 py-1.5 rounded-md flex items-center gap-2 transition-colors hover:bg-[#222]"
              onClick={() => handleToggleVersionTag(snap)}
            >
              <Tag
                className={cn(
                  "h-3 w-3 flex-shrink-0",
                  snap.isVersionTag ? "text-amber-400" : "text-neutral-500"
                )}
              />
              <span
                className={
                  snap.isVersionTag ? "text-amber-400" : "text-neutral-400 hover:text-neutral-200"
                }
              >
                {snap.isVersionTag ? "Remove version tag" : "Mark as version"}
              </span>
            </button>
            <div className="h-px bg-[#242424] my-1" />
            {/* Merge */}
            <div className="px-2 py-1">
              <p className="text-[9px] text-neutral-600 uppercase tracking-wider font-medium">
                Merge marker
              </p>
            </div>
            {!snap.mergedFromSnapshotId ? (
              <button
                className="w-full text-left text-[11px] text-neutral-400 hover:text-neutral-200 hover:bg-[#222] px-2.5 py-1.5 rounded-md flex items-center gap-2 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setCtxMenu(null);
                  setMergePicker(snap.id);
                }}
              >
                <GitMerge className="h-3 w-3 flex-shrink-0 text-purple-400" />
                Mark as merged from…
              </button>
            ) : (
              <button
                className="w-full text-left text-[11px] text-neutral-400 hover:text-red-400 hover:bg-[#222] px-2.5 py-1.5 rounded-md flex items-center gap-2 transition-colors"
                onClick={() => handleRemoveMerge(snap)}
              >
                <GitMerge className="h-3 w-3 flex-shrink-0 text-purple-400" />
                Remove merge marker
              </button>
            )}
          </div>
        );
      })()}

      {/* ── Branch name input overlay ── */}
      {branchInput && (
        <div
          className="fixed z-[60] bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-2 shadow-2xl"
          style={{ left: branchInput.x, top: branchInput.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[10px] text-neutral-600 mb-1.5">
            {branchInput.mode === "create" ? "New branch name" : "Rename branch"}
          </p>
          <div className="flex gap-1.5">
            <input
              ref={branchInputRef}
              value={branchInput.value}
              onChange={(e) =>
                setBranchInput((prev) =>
                  prev ? { ...prev, value: e.target.value } : prev
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") commitBranch();
                if (e.key === "Escape") setBranchInput(null);
              }}
              placeholder="e.g. feature/dark-mode"
              className="w-44 text-[11px] bg-[#252525] border border-[#333] rounded px-2 py-1 text-neutral-200 outline-none focus:border-blue-600/60 placeholder-neutral-700"
            />
            <button
              onClick={commitBranch}
              className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
