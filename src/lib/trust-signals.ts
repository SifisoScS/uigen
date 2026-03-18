/**
 * Trust signal combination — Distributed PKL Trust & Reputation (§16).
 *
 * Combines a NodeTrustSummary (node-level ubuntu score) with an optional
 * ArtifactTrustHint (artifact-scoped confidence) into a single EffectiveTrust.
 *
 * §16.4 Rule 5 (Non-Binding): callers MUST treat the result as advisory only.
 */

import type { ArtifactTrustHint, NodeTrustSummary } from "@/lib/mesh-client";

export interface EffectiveTrust {
  node_ubuntu: number;
  artifact_confidence: number | null;
  label: string;
}

/**
 * Combine node-level and artifact-level trust signals into a single label.
 *
 * When no artifactHint is provided, the label is derived from the node
 * ubuntu_score alone and is suffixed with "-node" to distinguish it.
 *
 * When an artifactHint is provided, the label is the average of both scores:
 *   ≥ 0.8 → "high", ≥ 0.4 → "medium", < 0.4 → "low"
 */
export function combineTrustSignals(
  node: NodeTrustSummary,
  artifactHint?: ArtifactTrustHint | null
): EffectiveTrust {
  const nodeScore = node.ubuntu_score;

  if (!artifactHint) {
    const label =
      nodeScore >= 0.8 ? "high-node" :
      nodeScore >= 0.4 ? "medium-node" : "low-node";
    return { node_ubuntu: nodeScore, artifact_confidence: null, label };
  }

  const combined = (nodeScore + artifactHint.confidence) / 2;
  const label = combined >= 0.8 ? "high" : combined >= 0.4 ? "medium" : "low";
  return {
    node_ubuntu: nodeScore,
    artifact_confidence: artifactHint.confidence,
    label,
  };
}
