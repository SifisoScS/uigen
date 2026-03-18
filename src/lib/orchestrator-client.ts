/**
 * Mesh Orchestrator client (§21 — Phase 48).
 *
 * Typed HTTP call to:
 *   POST {baseUrl}/mesh/orchestrate — compute signed OrchestrationDecision
 */

import type { OrchestrationDecision } from "@/lib/mesh-client";

/**
 * POST /mesh/orchestrate — request an OrchestrationDecision (§21.3).
 *
 * The decision includes candidate_nodes ordered by trust (ubuntu_score desc),
 * policy defaults, and an Ed25519 signature.
 *
 * @param baseUrl    - Remote Mesh node URL
 * @param artifactId - Artifact to orchestrate a build for
 * @param signal     - Optional AbortSignal
 * @throws Error on non-2xx response or network failure
 */
export async function requestOrchestration(
  baseUrl: string,
  artifactId: string,
  signal?: AbortSignal
): Promise<OrchestrationDecision> {
  const url = `${baseUrl.replace(/\/+$/, "")}/mesh/orchestrate`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ artifact_id: artifactId }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`Orchestration failed: ${res.status} from ${url}`);
  }
  return (await res.json()) as OrchestrationDecision;
}
