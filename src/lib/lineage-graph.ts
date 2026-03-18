/**
 * LineageGraph builder — Cross-Node Lineage Sync (§15).
 *
 * Transforms a flat LineageHop[] from GET /mesh/lineage/{id} into a
 * structured graph suitable for rendering and cross-repo traversal.
 */

import type { LineageHop } from "@/lib/mesh-client";

/** A single node in the lineage graph, enriched with hop index. */
export interface LineageNode {
  hopIndex: number;
  node_did: string;
  mesh_id: string;
  timestamp: number;
}

/** The full lineage graph for one artifact. */
export interface LineageGraph {
  artifactId: string;
  hopCount: number;
  originNodeDid: string | null;
  nodes: LineageNode[];
}

/**
 * Build a LineageGraph from an ordered LineageHop array (§15.2).
 *
 * @param artifactId - The artifact whose lineage this represents
 * @param hops - Ordered hops from the remote node (origin first)
 * @returns A structured LineageGraph; empty graph if hops is empty
 */
export function buildLineageGraph(
  artifactId: string,
  hops: LineageHop[]
): LineageGraph {
  const nodes: LineageNode[] = hops.map((hop, i) => ({
    hopIndex: i,
    node_did: hop.node_did,
    mesh_id: hop.mesh_id,
    timestamp: hop.timestamp,
  }));

  return {
    artifactId,
    hopCount: nodes.length,
    originNodeDid: nodes.length > 0 ? nodes[0].node_did : null,
    nodes,
  };
}
