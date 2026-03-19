"use server";

/**
 * Request a distributed Forge build through the full sovereign Mesh protocol.
 *
 * Flow (§18 + §19 + §20 + §21):
 *  1. Fetch artifact, lineage, trust from ExternalRepo (§14/§15/§16)
 *  2. §21 — Request orchestration → candidate_nodes (best-effort)
 *  3. §18 — POST /mesh/mance/propose → signed ManceProposal
 *  4. §18/§22.5 — POST /mesh/mance/vote → signed ManceVote + quorum result
 *  5. §19 — POST /mesh/critique/submit → signed CritiqueScore (best-effort)
 *  6. §19 — GET  /mesh/critique/aggregate → CritiqueAggregate (best-effort)
 *  7. §18 — POST /mesh/forge/assign  → signed ForgeTask (uses orchestration candidate)
 *  8. §20 — POST /mesh/forge/run    → signed BuildReceipt; verify sig (best-effort)
 *
 * Constitutional rules:
 *  - Gate governance delegated to Sifiso OS endpoints
 *  - No PKL leakage — only trust signals forwarded
 *  - Signature verification for critique (§19.4 Rule 2) and receipt (§20.3 Rule 6)
 *  - Deterministic assignment — max(ubuntu_score), DID tiebreaker (§18.6 Rule 6)
 */

import { getSession } from "@/lib/auth";
import { submitCritique, getCritiqueAggregate } from "@/lib/critique-client";
import { verifyEd25519 } from "@/lib/ed25519";
import { runForgeTask } from "@/lib/forge-client";
import { assignForgeTask, proposeMance, voteMance } from "@/lib/mance-client";
import {
  fetchMeshArtifact,
  fetchMeshLineage,
  fetchMeshNodeTrust,
  type BuildReceipt,
  type CritiqueAggregate,
  type CritiqueScore,
  type ForgeTask,
  type ManceProposal,
  type ManceVote,
  type OrchestrationDecision,
} from "@/lib/mesh-client";
import { requestOrchestration } from "@/lib/orchestrator-client";
import { prisma } from "@/lib/prisma";
import { combineTrustSignals } from "@/lib/trust-signals";

export interface DistributedBuildResult {
  repoId: string;
  repoName: string;
  orchestration: OrchestrationDecision | null;   // §21
  proposal: ManceProposal;                        // §18
  vote: ManceVote;                                // §18
  critique: CritiqueScore | null;                 // §19
  critiqueAggregate: CritiqueAggregate | null;    // §19
  task: ForgeTask;                                // §18
  receipt: BuildReceipt | null;                   // §20
  requestedAt: Date;
}

/**
 * Request a fully-orchestrated distributed Forge build for `artifactId`
 * from the registered ExternalRepo identified by `externalRepoId`.
 *
 * Best-effort steps (orchestration, critique, receipt) return null on failure.
 * Signature verification failures always throw (§17 / §19 / §20 rules).
 */
export async function requestDistributedBuild(
  externalRepoId: string,
  artifactId: string
): Promise<DistributedBuildResult> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const repo = await prisma.externalRepo.findUnique({
    where: { id: externalRepoId },
    select: { id: true, name: true, url: true, nodeId: true, publicKey: true },
  });
  if (!repo) throw new Error("ExternalRepo not found");

  // ── 1. Fetch artifact, lineage, trust ───────────────────────────────────────
  let lineageHops: Awaited<ReturnType<typeof fetchMeshLineage>> = [];
  try {
    lineageHops = await fetchMeshLineage(repo.url, artifactId, AbortSignal.timeout(5_000));
  } catch { /* best-effort */ }

  const artifactResponse = await fetchMeshArtifact(
    repo.url, artifactId, AbortSignal.timeout(10_000)
  ).catch((err) => { throw new Error(`Artifact fetch failed: ${String(err)}`); });
  if (!artifactResponse.signature) throw new Error("Missing artifact signature");

  let trust = { node_ubuntu: 0.5, artifact_confidence: null as number | null, label: "medium" };
  try {
    const nodeTrust = await fetchMeshNodeTrust(repo.url, AbortSignal.timeout(5_000));
    const combined = combineTrustSignals(nodeTrust);
    trust = {
      node_ubuntu: combined.node_ubuntu,
      artifact_confidence: combined.artifact_confidence,
      label: combined.label,
    };
  } catch { /* best-effort */ }

  // ── 2. §21 — Orchestration (best-effort) ────────────────────────────────────
  let orchestration: OrchestrationDecision | null = null;
  try {
    orchestration = await requestOrchestration(
      repo.url, artifactId, AbortSignal.timeout(5_000)
    );
  } catch { /* best-effort */ }

  // ── 3. §18 — Propose ────────────────────────────────────────────────────────
  const proposal = await proposeMance(
    repo.url, artifactId, lineageHops, trust, AbortSignal.timeout(10_000)
  );

  // ── 4. §18/§22.5 — Quorum vote (fan-out to registered peers if any) ──────────
  const vote = await voteMance(
    repo.url,
    proposal.proposal_id,
    "approve",
    "Quorum vote (§22.5 — Phase 49)",
    AbortSignal.timeout(10_000)
  );

  // ── 5–6. §19 — Self-critique + aggregate (best-effort) ──────────────────────
  let critique: CritiqueScore | null = null;
  let critiqueAggregate: CritiqueAggregate | null = null;
  try {
    critique = await submitCritique(
      repo.url,
      proposal.proposal_id,
      artifactId,
      0.9,
      "Self-critique (Phase 46 stub)",
      AbortSignal.timeout(5_000)
    );
    // §19.4 Rule 2 — verify DID binding via signature
    if (critique && repo.publicKey) {
      const canonical =
        `${critique.proposal_id}:${critique.artifact_id}:${critique.critic_node_did}` +
        `:${critique.score}:${critique.timestamp}`;
      if (!verifyEd25519(critique.signature, canonical, repo.publicKey)) {
        throw new Error("CritiqueScore signature verification failed");
      }
    }
    critiqueAggregate = await getCritiqueAggregate(
      repo.url, proposal.proposal_id, AbortSignal.timeout(5_000)
    );
  } catch (err) {
    if (String(err).includes("signature")) throw err; // re-throw verification failures
    critique = null;
    critiqueAggregate = null;
  }

  // ── 7. §18 — Assign (use first orchestration candidate, else nodeId) ─────────
  const primaryCandidate =
    orchestration?.candidate_nodes?.[0] ?? repo.nodeId ?? "did:key:zunknown";
  const selfPeer = {
    node_did: primaryCandidate,
    trust: {
      node_ubuntu: trust.node_ubuntu,
      artifact_confidence: trust.artifact_confidence,
      label: trust.label,
    },
  };
  const task = await assignForgeTask(
    repo.url, proposal.proposal_id, artifactId, [selfPeer], AbortSignal.timeout(10_000)
  );

  // ── 8. §20 — Run Forge task → BuildReceipt (best-effort; verify sig) ─────────
  let receipt: BuildReceipt | null = null;
  try {
    receipt = await runForgeTask(repo.url, task, AbortSignal.timeout(10_000));
    // §20.3 Rule 6 — verify signature when publicKey available
    if (receipt && repo.publicKey) {
      const canonical =
        `${receipt.task_id}:${receipt.artifact_id}:${receipt.runner_node_did}` +
        `:${receipt.status}:${receipt.logs_hash}:${receipt.timestamp}`;
      if (!verifyEd25519(receipt.signature, canonical, repo.publicKey)) {
        throw new Error("BuildReceipt signature verification failed");
      }
    }
  } catch (err) {
    if (String(err).includes("signature")) throw err; // re-throw verification failures
    receipt = null;
  }

  return {
    repoId: repo.id,
    repoName: repo.name,
    orchestration,
    proposal,
    vote,
    critique,
    critiqueAggregate,
    task,
    receipt,
    requestedAt: new Date(),
  };
}
