"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  X, Network, ZoomIn, ZoomOut, RefreshCw,
  GitBranch, Pin, RotateCcw, GitFork, GitCompare,
} from "lucide-react";
import { toast } from "sonner";
import { getSnapshots } from "@/actions/get-snapshots";
import { getSnapshot } from "@/actions/get-snapshot";
import { restoreSnapshot } from "@/actions/restore-snapshot";
import { forkSnapshot } from "@/actions/fork-snapshot";
import { useFileSystem } from "@/lib/contexts/file-system-context";
import { SnapshotDiffModal } from "@/components/SnapshotDiffModal";
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
const V_CENTER = 80; // top-y of node row
const SVG_H = 248;

function nodeX(i: number) {
  return H_MARGIN + i * (NODE_W + H_GAP);
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
  let added = 0;
  let removed = 0;
  let modified = 0;
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
      // user may not be owner
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots, generationCount]);

  // Chronological order: oldest left → newest right
  const chronological = useMemo(
    () =>
      [...snapshots].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    [snapshots]
  );

  const svgWidth =
    H_MARGIN * 2 +
    Math.max(1, chronological.length) * (NODE_W + H_GAP) -
    H_GAP;

  // ── Zoom / Pan ────────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.3, Math.min(2.5, z - e.deltaY * 0.001)));
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Only start drag on the SVG background, not on foreignObject children
    const target = e.target as Element;
    if (target.tagName !== "svg" && target.tagName !== "rect" && target.tagName !== "path") return;
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

  // ── Interaction state ─────────────────────────────────────────────────────
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [selectA, setSelectA] = useState<string | null>(null);
  const [diffSpec, setDiffSpec] = useState<DiffSpec | null>(null);
  const [pendingRestore, setPendingRestore] = useState<string | null>(null);
  const [pendingFork, setPendingFork] = useState<string | null>(null);

  // ── Hover diff cache ──────────────────────────────────────────────────────
  const dataCache = useRef<Map<string, Map<string, string>>>(new Map());
  const [hoverSummary, setHoverSummary] = useState<{
    id: string;
    summary: ChangeSummary;
  } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadHoverSummary = useCallback(
    async (snap: Snapshot, prevSnap: Snapshot | undefined) => {
      const getFiles = async (id: string): Promise<Map<string, string>> => {
        if (dataCache.current.has(id)) return dataCache.current.get(id)!;
        const s = await getSnapshot(id);
        const files = extractFiles(s.data);
        dataCache.current.set(id, files);
        return files;
      };
      try {
        const afterFiles = await getFiles(snap.id);
        const beforeFiles = prevSnap
          ? await getFiles(prevSnap.id)
          : new Map<string, string>();
        setHoverSummary({ id: snap.id, summary: fileChangeSummary(beforeFiles, afterFiles) });
      } catch {
        // ignore
      }
    },
    []
  );

  const handleNodeHoverEnter = useCallback(
    (snap: Snapshot, prevSnap: Snapshot | undefined) => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      setHoveredId(snap.id);
      hoverTimer.current = setTimeout(() => {
        loadHoverSummary(snap, prevSnap);
      }, 250);
    },
    [loadHoverSummary]
  );

  const handleNodeHoverLeave = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHoveredId(null);
    setHoverSummary(null);
  }, []);

  const handleNodeClick = useCallback(
    (e: React.MouseEvent, snap: Snapshot) => {
      e.stopPropagation();
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
      } else {
        setMenuId((prev) => (prev === snap.id ? null : snap.id));
      }
    },
    [selectA, chronological]
  );

  // ── Actions ───────────────────────────────────────────────────────────────
  async function handleRestore(snapshotId: string) {
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
  }

  async function handleFork(snap: Snapshot) {
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
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (diffSpec) setDiffSpec(null);
        else onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, diffSpec]);

  // ── Render diff modal on top ───────────────────────────────────────────────
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

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex flex-col"
      onClick={() => {
        setMenuId(null);
        setSelectA(null);
      }}
    >
      {/* ── Header ── */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-[#1f1f1f] bg-[#111111] flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <Network className="h-4 w-4 text-neutral-500" />
          <span className="text-sm text-neutral-200 font-medium">Version Graph</span>
          {!loading && (
            <span className="text-[11px] text-neutral-600">
              {chronological.length} checkpoint
              {chronological.length !== 1 ? "s" : ""}
            </span>
          )}
          {selectA && (
            <span className="text-[11px] text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
              Shift-click another node to compare
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
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
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {/* ── Dot-grid background ── */}
              <defs>
                <pattern
                  id="vg-grid"
                  width="28"
                  height="28"
                  patternUnits="userSpaceOnUse"
                >
                  <circle cx="1" cy="1" r="0.9" fill="#1e1e1e" />
                </pattern>
              </defs>
              <rect
                x={-10000}
                y={-10000}
                width={99999}
                height={99999}
                fill="url(#vg-grid)"
              />

              {/* ── Edges ── */}
              {chronological.slice(0, -1).map((snap, i) => {
                const x1 = nodeX(i) + NODE_W;
                const x2 = nodeX(i + 1);
                const y = V_CENTER + NODE_H / 2;
                const mx = (x1 + x2) / 2;
                return (
                  <path
                    key={`edge-${snap.id}`}
                    d={`M ${x1} ${y} C ${mx} ${y} ${mx} ${y} ${x2} ${y}`}
                    fill="none"
                    stroke="#2a2a2a"
                    strokeWidth="2"
                    strokeLinecap="round"
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
                const summary =
                  hoverSummary?.id === snap.id ? hoverSummary.summary : null;
                const hasSummary = isHovered && summary !== null;
                const nodeHeight = hasSummary ? NODE_H + 26 : NODE_H;
                const isPendingRestore = pendingRestore === snap.id;
                const isPendingFork = pendingFork === snap.id;

                return (
                  <g key={snap.id} transform={`translate(${x},${y})`}>
                    {/* ── Node card (foreignObject) ── */}
                    <foreignObject
                      width={NODE_W}
                      height={nodeHeight}
                      style={{ overflow: "visible" }}
                    >
                      <div
                        /* @ts-expect-error – xmlns required for SVG foreignObject */
                        xmlns="http://www.w3.org/1999/xhtml"
                        className={cn(
                          "w-full rounded-lg border p-2.5 flex flex-col gap-1.5 cursor-pointer transition-all select-none",
                          isSelected
                            ? "bg-blue-950/50 border-blue-500/40 shadow-lg shadow-blue-500/10"
                            : isMenuOpen || isHovered
                            ? "bg-[#1c1c1c] border-[#2e2e2e] shadow-lg shadow-black/50"
                            : "bg-[#151515] border-[#222]"
                        )}
                        style={{ fontFamily: "system-ui, sans-serif", height: nodeHeight }}
                        onMouseEnter={() =>
                          handleNodeHoverEnter(snap, chronological[i - 1])
                        }
                        onMouseLeave={handleNodeHoverLeave}
                        onClick={(e) =>
                          handleNodeClick(e as unknown as React.MouseEvent, snap)
                        }
                      >
                        {/* Top row */}
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-medium text-neutral-200 truncate leading-tight">
                              {displayName(snap)}
                            </p>
                            <p className="text-[10px] text-neutral-600 mt-0.5 leading-tight">
                              {new Date(snap.createdAt).toLocaleDateString(
                                "en-US",
                                { month: "short", day: "numeric" }
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                            {snap.pinned && (
                              <Pin className="h-3 w-3 text-yellow-500" />
                            )}
                            {snap.forkCount > 0 && (
                              <span className="flex items-center gap-0.5 text-[9px] text-neutral-500 bg-[#222] px-1 py-0.5 rounded">
                                <GitBranch className="h-2.5 w-2.5" />
                                {snap.forkCount}
                              </span>
                            )}
                          </div>
                        </div>

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
                            {summary.added > 0 && (
                              <span className="text-[10px] text-emerald-400 font-medium">
                                +{summary.added}
                              </span>
                            )}
                            {summary.modified > 0 && (
                              <span className="text-[10px] text-yellow-400 font-medium">
                                ~{summary.modified}
                              </span>
                            )}
                            {summary.removed > 0 && (
                              <span className="text-[10px] text-red-400 font-medium">
                                -{summary.removed}
                              </span>
                            )}
                            {summary.added === 0 &&
                              summary.modified === 0 &&
                              summary.removed === 0 && (
                                <span className="text-[10px] text-neutral-600">
                                  {i === 0 ? "initial" : "no changes"}
                                </span>
                              )}
                            <span className="text-[9px] text-neutral-700">files</span>
                          </div>
                        )}
                      </div>
                    </foreignObject>

                    {/* ── Action menu ── */}
                    {isMenuOpen && (
                      <foreignObject
                        x={0}
                        y={NODE_H + 8}
                        width={NODE_W}
                        height={160}
                        style={{ overflow: "visible" }}
                      >
                        <div
                          /* @ts-expect-error */
                          xmlns="http://www.w3.org/1999/xhtml"
                          className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-1 shadow-2xl shadow-black/70 flex flex-col gap-0.5"
                          style={{ fontFamily: "system-ui, sans-serif" }}
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                          <button
                            className={cn(
                              "w-full text-left text-[11px] px-2.5 py-1.5 rounded-md flex items-center gap-2 transition-colors",
                              isPendingRestore
                                ? "text-red-400 bg-red-950/30 hover:bg-red-950/50"
                                : "text-neutral-400 hover:text-neutral-200 hover:bg-[#222]"
                            )}
                            onClick={() => handleRestore(snap.id)}
                          >
                            <RotateCcw className="h-3 w-3 flex-shrink-0" />
                            {isPendingRestore
                              ? "Click again to confirm"
                              : "Restore to this"}
                          </button>
                          <button
                            className="w-full text-left text-[11px] text-neutral-400 hover:text-neutral-200 hover:bg-[#222] px-2.5 py-1.5 rounded-md flex items-center gap-2 transition-colors disabled:opacity-50"
                            disabled={!!pendingFork}
                            onClick={() => handleFork(snap)}
                          >
                            <GitFork className="h-3 w-3 flex-shrink-0" />
                            {isPendingFork ? "Forking…" : "Fork from this"}
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

        {/* ── Legend ── */}
        {!loading && chronological.length > 0 && (
          <div className="absolute bottom-4 right-4 flex items-center gap-3 text-[10px] text-neutral-700 pointer-events-none">
            <span>Click for actions</span>
            <span className="text-neutral-800">·</span>
            <span>Shift+click two nodes to diff</span>
            <span className="text-neutral-800">·</span>
            <span>Scroll to zoom · drag to pan</span>
          </div>
        )}
      </div>
    </div>
  );
}
