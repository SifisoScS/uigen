/**
 * MANCE client — Multi-Node MANCE & Distributed Forge Pipelines (§18 — Phase 45).
 *
 * Typed HTTP calls to:
 *   POST {baseUrl}/mesh/mance/propose  — create and sign a ManceProposal
 *   POST {baseUrl}/mesh/mance/vote     — create and sign a ManceVote
 *   POST {baseUrl}/mesh/forge/assign   — deterministically assign a ForgeTask
 */

import type {
  ForgeTask,
  LineageHop,
  ManceProposal,
  ManceVote,
  PeerNodeDescriptor,
} from "@/lib/mesh-client";

function normalizeUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

async function postJson<T>(
  url: string,
  body: unknown,
  signal?: AbortSignal
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    throw new Error(`MANCE request failed: ${res.status} from ${url}`);
  }
  return (await res.json()) as T;
}

/**
 * POST /mesh/mance/propose — create and return a signed ManceProposal (§18.2).
 *
 * @param baseUrl     - Remote Mesh node URL
 * @param artifactId  - Artifact under consideration
 * @param lineageHops - Custody chain from §15
 * @param trust       - EffectiveTrust from §16
 * @param signal      - Optional AbortSignal
 */
export async function proposeMance(
  baseUrl: string,
  artifactId: string,
  lineageHops: LineageHop[],
  trust: { node_ubuntu: number; artifact_confidence: number | null; label: string },
  signal?: AbortSignal
): Promise<ManceProposal> {
  return postJson<ManceProposal>(
    `${normalizeUrl(baseUrl)}/mesh/mance/propose`,
    { artifact_id: artifactId, lineage_hops: lineageHops, trust },
    signal
  );
}

/**
 * POST /mesh/mance/vote — create and return a signed ManceVote (§18.3).
 *
 * @param baseUrl    - Remote Mesh node URL
 * @param proposalId - The proposal being voted on
 * @param vote       - "approve" | "reject"
 * @param reason     - Human-readable rationale
 * @param signal     - Optional AbortSignal
 */
export async function voteMance(
  baseUrl: string,
  proposalId: string,
  vote: "approve" | "reject",
  reason: string,
  signal?: AbortSignal
): Promise<ManceVote> {
  return postJson<ManceVote>(
    `${normalizeUrl(baseUrl)}/mesh/mance/vote`,
    { proposal_id: proposalId, vote, reason },
    signal
  );
}

/**
 * POST /mesh/forge/assign — deterministically assign a ForgeTask (§18.4).
 *
 * Assignment is max(ubuntu_score), DID tiebreaker (§18.6 Rule 6).
 *
 * @param baseUrl    - Remote Mesh node URL
 * @param proposalId - The proposal driving this build
 * @param artifactId - Artifact to build
 * @param peers      - Candidate peer nodes with trust scores
 * @param signal     - Optional AbortSignal
 */
export async function assignForgeTask(
  baseUrl: string,
  proposalId: string,
  artifactId: string,
  peers: PeerNodeDescriptor[],
  signal?: AbortSignal
): Promise<ForgeTask> {
  return postJson<ForgeTask>(
    `${normalizeUrl(baseUrl)}/mesh/forge/assign`,
    { proposal_id: proposalId, artifact_id: artifactId, peers },
    signal
  );
}
