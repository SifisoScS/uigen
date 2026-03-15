"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { GitFork, Maximize2, Loader2 } from "lucide-react";
import {
  getArtifactLineageDeep,
  type ArtifactLineageDeep,
  type ArtifactNode,
  type CrossParentNode,
} from "@/actions/get-artifact-lineage";

// ── Layout constants ──────────────────────────────────────────────────────────

const NODE_W = 180;
const NODE_H = 76;
const V_GAP = 80;
const H_GAP = 24;
const PADDING = 40;

// ── Types ─────────────────────────────────────────────────────────────────────

interface LayoutNode extends ArtifactNode {
  x: number;
  y: number;
}

interface WorkflowLayoutNode extends CrossParentNode {
  x: number;
  y: number;
}

interface Edge {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  key: string;
  dashed?: boolean;
}

interface Layout {
  nodes: LayoutNode[];
  workflowNodes: WorkflowLayoutNode[];
  edges: Edge[];
  canvasW: number;
  canvasH: number;
}

interface Transform {
  x: number;
  y: number;
  scale: number;
}

export interface LineageGraphProps {
  initialData: ArtifactLineageDeep;
  currentId: string;
}

// ── Layout computation ────────────────────────────────────────────────────────

function computeLayout(data: ArtifactLineageDeep, currentId: string): Layout {
  const { parents, current, children, crossParents } = data;

  const childCount = children.length;
  const wfCount = crossParents.length;
  const childRowW = childCount > 0 ? childCount * NODE_W + (childCount - 1) * H_GAP : 0;
  const wfRowW    = wfCount    > 0 ? wfCount    * NODE_W + (wfCount    - 1) * H_GAP : 0;
  const canvasW = Math.max(NODE_W + PADDING * 2, childRowW + PADDING * 2, wfRowW + PADDING * 2);
  const centerX = canvasW / 2;

  // WorkflowRun row sits at the very top, offset from PADDING
  const wfOffset = wfCount > 0 ? NODE_H + V_GAP : 0;
  const wfStartX = centerX - wfRowW / 2;
  const workflowNodes: WorkflowLayoutNode[] = crossParents.map((cp, i) => ({
    ...cp,
    x: wfStartX + i * (NODE_W + H_GAP),
    y: PADDING,
  }));

  // Ancestors: stacked below workflow row
  const parentNodes: LayoutNode[] = parents.map((p, i) => ({
    ...p,
    x: centerX - NODE_W / 2,
    y: PADDING + wfOffset + i * (NODE_H + V_GAP),
  }));

  // Current node
  const currentY = PADDING + wfOffset + parents.length * (NODE_H + V_GAP);
  const currentNode: LayoutNode = {
    ...current,
    x: centerX - NODE_W / 2,
    y: currentY,
  };

  // Children: row below current
  const childY = currentY + NODE_H + V_GAP;
  const childStartX = centerX - childRowW / 2;
  const childNodes: LayoutNode[] = children.map((c, i) => ({
    ...c,
    x: childStartX + i * (NODE_W + H_GAP),
    y: childY,
  }));

  const canvasH = childY + (childCount > 0 ? NODE_H : 0) + PADDING;

  // Edges: parent chain
  const edges: Edge[] = [];
  const chain = [...parentNodes, currentNode];
  for (let i = 0; i < chain.length - 1; i++) {
    const from = chain[i];
    const to = chain[i + 1];
    edges.push({
      fromX: from.x + NODE_W / 2,
      fromY: from.y + NODE_H,
      toX: to.x + NODE_W / 2,
      toY: to.y,
      key: `${from.id}->${to.id}`,
    });
  }
  // Edges: children
  for (const child of childNodes) {
    edges.push({
      fromX: currentNode.x + NODE_W / 2,
      fromY: currentNode.y + NODE_H,
      toX: child.x + NODE_W / 2,
      toY: child.y,
      key: `${currentId}->${child.id}`,
    });
  }
  // Edges: WorkflowRun → current (dashed — orthogonal to remix lineage)
  for (const wf of workflowNodes) {
    edges.push({
      fromX: wf.x + NODE_W / 2,
      fromY: wf.y + NODE_H,
      toX: currentNode.x + NODE_W / 2,
      toY: currentNode.y,
      key: `wf-${wf.id}->${currentId}`,
      dashed: true,
    });
  }

  return {
    nodes: [...parentNodes, currentNode, ...childNodes],
    workflowNodes,
    edges,
    canvasW,
    canvasH,
  };
}

// ── Policy badge helpers ──────────────────────────────────────────────────────

function policyLabel(p: string | null): string {
  if (!p || p === "OPEN") return "OPEN";
  return p.replace("_", " ");
}

interface PolicyColors {
  bg: string;
  text: string;
  border: string;
}

function policyColors(p: string | null): PolicyColors {
  switch (p) {
    case "HUMAN_ONLY":
      return { bg: "#052e16", text: "#4ade80", border: "#166534" };
    case "AI_ONLY":
      return { bg: "#172554", text: "#60a5fa", border: "#1e40af" };
    case "LOCKED":
      return { bg: "#450a0a", text: "#f87171", border: "#991b1b" };
    default:
      return { bg: "#171717", text: "#a3a3a3", border: "#404040" };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LineageGraph({ initialData, currentId }: LineageGraphProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  // Render state
  const [data, setData] = useState<ArtifactLineageDeep>(initialData);
  const [depth, setDepth] = useState(1);
  const [isFetching, setIsFetching] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Transform: use both state (for render) and ref (for event handlers)
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const transformRef = useRef<Transform>({ x: 0, y: 0, scale: 1 });

  // Drag tracking refs (avoid stale closures in event handlers)
  const dragStartRef = useRef<{
    px: number;
    py: number;
    tx: number;
    ty: number;
  } | null>(null);
  const isDraggingRef = useRef(false);

  // Pointer map for pinch-zoom
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  const layout = useMemo(
    () => computeLayout(data, currentId),
    [data, currentId]
  );

  // ── Fit to view ────────────────────────────────────────────────────────────

  const fitToView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    const scaleX = (width - 60) / layout.canvasW;
    const scaleY = (height - 60) / layout.canvasH;
    const newScale = Math.min(scaleX, scaleY, 1.5);
    const newX = (width - layout.canvasW * newScale) / 2;
    const newY = (height - layout.canvasH * newScale) / 2;
    const next: Transform = { x: newX, y: newY, scale: newScale };
    transformRef.current = next;
    setTransform(next);
  }, [layout]);

  // Fit on first render and when layout changes (e.g. depth change)
  useEffect(() => {
    // Use rAF so container has measured dimensions
    const id = requestAnimationFrame(fitToView);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  // ── Wheel zoom (passive: false required) ──────────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const t = transformRef.current;
      const factor = Math.pow(0.999, e.deltaY);
      const newScale = Math.max(0.15, Math.min(4, t.scale * factor));
      const rect = el!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const newX = mx - (mx - t.x) * (newScale / t.scale);
      const newY = my - (my - t.y) * (newScale / t.scale);
      const next: Transform = { x: newX, y: newY, scale: newScale };
      transformRef.current = next;
      setTransform(next);
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── Pointer events (drag + pinch) ─────────────────────────────────────────

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as Element).closest("[data-node]")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      const t = transformRef.current;
      dragStartRef.current = { px: e.clientX, py: e.clientY, tx: t.x, ty: t.y };
      isDraggingRef.current = true;
      setIsDragging(true);
    } else {
      // Second pointer arrived — cancel drag, start pinch
      dragStartRef.current = null;
      isDraggingRef.current = false;
      setIsDragging(false);
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const pointers = pointersRef.current;
    const prev = pointers.get(e.pointerId);

    if (pointers.size === 2 && prev) {
      // ── Pinch-zoom ────────────────────────────────────────────────────────
      const ids = [...pointers.keys()];
      const otherId = ids.find((id) => id !== e.pointerId)!;
      const other = pointers.get(otherId)!;
      const prevDist = Math.hypot(prev.x - other.x, prev.y - other.y);
      const newDist = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (prevDist > 0) {
        const factor = newDist / prevDist;
        const t = transformRef.current;
        const newScale = Math.max(0.15, Math.min(4, t.scale * factor));
        const container = containerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          const midX = (e.clientX + other.x) / 2 - rect.left;
          const midY = (e.clientY + other.y) / 2 - rect.top;
          const newX = midX - (midX - t.x) * (newScale / t.scale);
          const newY = midY - (midY - t.y) * (newScale / t.scale);
          const next: Transform = { x: newX, y: newY, scale: newScale };
          transformRef.current = next;
          setTransform(next);
        }
      }
    } else if (pointers.size === 1 && isDraggingRef.current && dragStartRef.current) {
      // ── Pan ───────────────────────────────────────────────────────────────
      const ds = dragStartRef.current;
      const dx = e.clientX - ds.px;
      const dy = e.clientY - ds.py;
      const t = transformRef.current;
      const next: Transform = { ...t, x: ds.tx + dx, y: ds.ty + dy };
      transformRef.current = next;
      setTransform(next);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) {
      isDraggingRef.current = false;
      dragStartRef.current = null;
      setIsDragging(false);
    }
  }

  // ── Depth change ──────────────────────────────────────────────────────────

  async function handleDepthChange(newDepth: number) {
    setDepth(newDepth);
    setIsFetching(true);
    try {
      const newData = await getArtifactLineageDeep(currentId, newDepth);
      setData(newData);
    } catch {
      // keep current data on error
    } finally {
      setIsFetching(false);
    }
  }

  // ── Node click ────────────────────────────────────────────────────────────

  function onNodeClick(nodeId: string) {
    if (nodeId === currentId) return;
    router.push(`/share/${nodeId}`);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-500 select-none">Depth</span>
          <input
            type="range"
            min={1}
            max={7}
            value={depth}
            onChange={(e) => handleDepthChange(Number(e.target.value))}
            className="w-28 accent-blue-500"
            aria-label="Ancestry depth"
            data-testid="depth-slider"
          />
          <span className="text-xs font-mono text-neutral-400 w-4 select-none">
            {depth}
          </span>
        </div>

        <button
          onClick={fitToView}
          className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          aria-label="Fit to view"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Fit
        </button>
      </div>

      {/* Graph canvas */}
      <div
        ref={containerRef}
        data-testid="graph-canvas"
        className={`relative flex-1 min-h-0 rounded-xl border border-[#1f1f1f] bg-[#0a0a0a] overflow-hidden touch-none ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* Transformed inner canvas */}
        <div
          style={{
            position: "absolute",
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: "0 0",
            width: layout.canvasW,
            height: layout.canvasH,
          }}
        >
          {/* SVG edges layer */}
          <svg
            style={{
              position: "absolute",
              inset: 0,
              overflow: "visible",
              pointerEvents: "none",
            }}
            width={layout.canvasW}
            height={layout.canvasH}
            aria-hidden
          >
            <defs>
              <marker
                id="lg-arrow"
                markerWidth="8"
                markerHeight="6"
                refX="7"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" fill="#3a3a3a" />
              </marker>
            </defs>
            {layout.edges.map((edge) => (
              <line
                key={edge.key}
                x1={edge.fromX}
                y1={edge.fromY}
                x2={edge.toX}
                y2={edge.toY - 5}
                stroke={edge.dashed ? "#4a3a1a" : "#2a2a2a"}
                strokeWidth={1.5}
                strokeDasharray={edge.dashed ? "5 3" : undefined}
                markerEnd="url(#lg-arrow)"
              />
            ))}
          </svg>

          {/* Cross-parent node cards (WorkflowRun / DatasetSnapshot) */}
          {layout.workflowNodes.map((cp) => {
            const isDataset = cp.parentType === "DatasetSnapshot";
            return (
              <div
                key={`cp-${cp.id}`}
                data-node
                data-testid={isDataset ? `dataset-node-${cp.id}` : `workflow-node-${cp.id}`}
                style={{
                  position: "absolute",
                  left: cp.x,
                  top: cp.y,
                  width: NODE_W,
                  height: NODE_H,
                }}
                className={[
                  "rounded-lg border bg-[#111111] px-3 py-2 flex flex-col justify-between select-none cursor-pointer transition-colors",
                  isDataset
                    ? "border-emerald-800/60 hover:border-emerald-600/60"
                    : "border-dashed border-amber-800/60 hover:border-amber-600/60",
                ].join(" ")}
                onClick={() =>
                  router.push(
                    isDataset
                      ? `/dataset-snapshot/${cp.id}`
                      : `/workflow-run/${cp.id}`
                  )
                }
                role="button"
                aria-label={`View ${cp.parentType}: ${cp.parentName}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span
                    className={`text-[10px] font-medium leading-tight line-clamp-2 flex-1 min-w-0 ${
                      isDataset ? "text-emerald-400/80" : "text-amber-400/80"
                    }`}
                  >
                    {cp.parentName}
                  </span>
                  <span
                    className={`flex-shrink-0 text-[8px] font-medium rounded px-1 py-0.5 leading-none ml-1 mt-0.5 ${
                      isDataset
                        ? "text-emerald-700 bg-emerald-950/60 border border-emerald-800/40"
                        : "text-amber-700 bg-amber-950/60 border border-amber-800/40"
                    }`}
                  >
                    {isDataset ? "DATA" : "RUN"}
                  </span>
                </div>
                <span
                  className={`text-[8px] font-medium mt-1 ${
                    isDataset ? "text-emerald-800" : "text-amber-800"
                  }`}
                >
                  {cp.relationType}
                </span>
              </div>
            );
          })}

          {/* Artifact node cards */}
          {layout.nodes.map((node) => {
            const isCurrent = node.id === currentId;
            const colors = policyColors(node.policyType);
            return (
              <div
                key={node.id}
                data-node
                data-testid={`node-${node.id}`}
                style={{
                  position: "absolute",
                  left: node.x,
                  top: node.y,
                  width: NODE_W,
                  height: NODE_H,
                }}
                className={[
                  "rounded-lg border px-3 py-2 flex flex-col justify-between select-none transition-colors",
                  "bg-[#111111]",
                  isCurrent
                    ? "border-blue-500/60 ring-1 ring-blue-500/30 shadow-[0_0_18px_rgba(59,130,246,0.15)]"
                    : "border-[#2a2a2a] hover:border-[#3a3a3a] cursor-pointer",
                ].join(" ")}
                onClick={() => onNodeClick(node.id)}
                role={isCurrent ? undefined : "button"}
                aria-label={
                  isCurrent
                    ? `Current: ${node.name}`
                    : `Navigate to ${node.name}`
                }
              >
                {/* Name + version */}
                <div className="flex items-start justify-between gap-1">
                  <span className="text-[11px] font-medium text-neutral-100 leading-tight line-clamp-2 flex-1 min-w-0">
                    {node.name}
                  </span>
                  <span className="flex-shrink-0 text-[9px] font-mono text-neutral-500 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1 py-0.5 leading-none ml-1 mt-0.5">
                    v{node.version}
                  </span>
                </div>

                {/* Policy badge + remix count + current label */}
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  {node.policyType && (
                    <span
                      style={{
                        background: colors.bg,
                        color: colors.text,
                        borderColor: colors.border,
                      }}
                      className="text-[8px] font-medium px-1.5 py-0.5 rounded border leading-none"
                    >
                      {policyLabel(node.policyType)}
                    </span>
                  )}
                  {node.remixCount > 0 && (
                    <span className="flex items-center gap-0.5 text-[9px] text-neutral-600">
                      <GitFork className="h-2.5 w-2.5" />
                      {node.remixCount}
                    </span>
                  )}
                  {isCurrent && (
                    <span className="ml-auto text-[8px] text-blue-400 font-medium">
                      current
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Fetching overlay */}
        {isFetching && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/70 pointer-events-none">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
          </div>
        )}

        {/* Depth-reached notice */}
        {data.depthReached && !isFetching && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
            <span className="text-[10px] text-neutral-600 bg-[#111111] border border-[#2a2a2a] rounded-full px-3 py-1 whitespace-nowrap">
              Max depth reached · increase slider to see more
            </span>
          </div>
        )}

        {/* Empty state */}
        {layout.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-neutral-600">
            No lineage data
          </div>
        )}
      </div>
    </div>
  );
}
