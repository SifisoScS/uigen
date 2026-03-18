/**
 * Distributed Critique client (§19 — Phase 46).
 *
 * Typed HTTP calls to:
 *   POST {baseUrl}/mesh/critique/submit              — sign and store a CritiqueScore
 *   GET  {baseUrl}/mesh/critique/aggregate/{id}      — return aggregate (avg + count)
 */

import type { CritiqueAggregate, CritiqueScore } from "@/lib/mesh-client";

function normalizeUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

/**
 * POST /mesh/critique/submit — submit a critique score for a proposal (§19.1).
 *
 * @param baseUrl    - Remote Mesh node URL
 * @param proposalId - The ManceProposal being critiqued
 * @param artifactId - Artifact under evaluation
 * @param score      - 0.0–1.0; throws if out of range (client-side §19.4 validation)
 * @param comment    - Human-readable rationale (MUST NOT contain PKL content)
 * @param signal     - Optional AbortSignal
 */
export async function submitCritique(
  baseUrl: string,
  proposalId: string,
  artifactId: string,
  score: number,
  comment: string,
  signal?: AbortSignal
): Promise<CritiqueScore> {
  if (score < 0 || score > 1) {
    throw new Error(`score must be between 0.0 and 1.0, got: ${score}`);
  }

  const url = `${normalizeUrl(baseUrl)}/mesh/critique/submit`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ proposal_id: proposalId, artifact_id: artifactId, score, comment }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`Critique submit failed: ${res.status} from ${url}`);
  }
  return (await res.json()) as CritiqueScore;
}

/**
 * GET /mesh/critique/aggregate/{proposal_id} — fetch aggregate score (§19.2).
 *
 * @param baseUrl    - Remote Mesh node URL
 * @param proposalId - The proposal to aggregate scores for
 * @param signal     - Optional AbortSignal
 * @throws Error on 404 (no scores) or non-2xx
 */
export async function getCritiqueAggregate(
  baseUrl: string,
  proposalId: string,
  signal?: AbortSignal
): Promise<CritiqueAggregate> {
  const url = `${normalizeUrl(baseUrl)}/mesh/critique/aggregate/${encodeURIComponent(proposalId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    throw new Error(`Critique aggregate failed: ${res.status} from ${url}`);
  }
  return (await res.json()) as CritiqueAggregate;
}
