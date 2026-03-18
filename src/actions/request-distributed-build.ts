"use server";

/**
 * Request a distributed Forge build through the Multi-Node MANCE protocol (§18).
 *
 * Flow:
 *  1. Fetch artifact, lineage, and trust from the registered ExternalRepo
 *  2. Build a ManceProposal (lineage_hops + trust from §15/§16)
 *  3. POST to /mesh/mance/propose → signed proposal
 *  4. POST a local self-vote to /mesh/mance/vote (stub: local-only, Phase 46 adds quorum)
 *  5. POST to /mesh/forge/assign with this node as the only peer (self-assignment stub)
 *  6. Return the signed proposal, vote, and task
 *
 * Constitutional rules (§18.6):
 *  - Gate governance delegated to the Sifiso OS endpoints
 *  - No PKL leakage — only trust signals forwarded
 *  - Deterministic assignment — max(ubuntu_score), DID tiebreaker
 */

import { getSession } from "@/lib/auth";
import {
  assignForgeTask,
  proposeMance,
  voteMance,
} from "@/lib/mance-client";
import {
  fetchMeshArtifact,
  fetchMeshLineage,
  fetchMeshNodeTrust,
  type ForgeTask,
  type ManceProposal,
  type ManceVote,
} from "@/lib/mesh-client";
import { prisma } from "@/lib/prisma";
import { combineTrustSignals } from "@/lib/trust-signals";

export interface DistributedBuildResult {
  repoId: string;
  repoName: string;
  proposal: ManceProposal;
  vote: ManceVote;
  task: ForgeTask;
  requestedAt: Date;
}

/**
 * Request a distributed Forge build for `artifactId` from the registered
 * ExternalRepo identified by `externalRepoId`.
 *
 * The self-vote and single-peer assignment are Phase 45 stubs — Phase 46
 * will add multi-node quorum and real peer discovery.
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

  const signal = AbortSignal.timeout(10_000);

  // ── 1. Fetch artifact, lineage, trust ───────────────────────────────────────
  let lineageHops: Awaited<ReturnType<typeof fetchMeshLineage>> = [];
  try {
    lineageHops = await fetchMeshLineage(repo.url, artifactId, AbortSignal.timeout(5_000));
  } catch {
    // best-effort; empty lineage is valid for proposal
  }

  const artifactResponse = await fetchMeshArtifact(repo.url, artifactId, signal).catch(
    (err) => { throw new Error(`Artifact fetch failed: ${String(err)}`); }
  );
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
  } catch {
    // best-effort — use defaults
  }

  // ── 2. Propose ──────────────────────────────────────────────────────────────
  const proposal = await proposeMance(
    repo.url,
    artifactId,
    lineageHops,
    trust,
    AbortSignal.timeout(10_000)
  );

  // ── 3. Self-vote (Phase 45 stub — single local approver) ───────────────────
  const vote = await voteMance(
    repo.url,
    proposal.proposal_id,
    "approve",
    "Self-approval (Phase 45 stub — quorum in Phase 46)",
    AbortSignal.timeout(10_000)
  );

  // ── 4. Assign (self as only peer — Phase 45 stub) ──────────────────────────
  const selfPeer = {
    node_did: repo.nodeId ?? "did:key:zunknown",
    trust: {
      node_ubuntu: trust.node_ubuntu,
      artifact_confidence: trust.artifact_confidence,
      label: trust.label,
    },
  };

  const task = await assignForgeTask(
    repo.url,
    proposal.proposal_id,
    artifactId,
    [selfPeer],
    AbortSignal.timeout(10_000)
  );

  return {
    repoId: repo.id,
    repoName: repo.name,
    proposal,
    vote,
    task,
    requestedAt: new Date(),
  };
}
