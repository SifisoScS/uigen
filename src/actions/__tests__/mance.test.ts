import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    externalRepo: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/mesh-client", () => ({
  fetchMeshArtifact: vi.fn(),
  fetchMeshLineage: vi.fn(),
  fetchMeshNodeTrust: vi.fn(),
  fetchMeshArtifactTrust: vi.fn(),
}));

vi.mock("@/lib/mance-client", () => ({
  proposeMance: vi.fn(),
  voteMance: vi.fn(),
  assignForgeTask: vi.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { fetchMeshArtifact, fetchMeshLineage, fetchMeshNodeTrust } = await import("@/lib/mesh-client");
const { proposeMance, voteMance, assignForgeTask } = await import("@/lib/mance-client");
const { requestDistributedBuild } = await import("../request-distributed-build");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION = { userId: "u1", email: "t@t.com", expiresAt: new Date(Date.now() + 3_600_000) };

const REPO = {
  id: "repo-1",
  name: "Sifiso OS Node",
  url: "https://sifiso.example.com",
  nodeId: "did:key:zabc123",
  publicKey: "bb".repeat(32),
};

const ARTIFACT_RESPONSE = {
  summary: {
    artifact_id: "mesh:art-001",
    origin_node_did: "did:key:zabc123",
    lineage_hops: [{ node_did: "did:key:zabc123", mesh_id: "mesh:art-001", timestamp: 1700000000, signature: "cc".repeat(64) }],
    content_hash: "deadbeef".repeat(8),
    content_mime: "application/json",
    gate_log_merkle: "cafe1234".repeat(8),
    timestamp: Math.floor(Date.now() / 1000),
  },
  content: JSON.stringify({ mesh_id: "mesh:art-001" }),
  signature: "aa".repeat(64),
};

const HOP = { node_did: "did:key:zabc123", mesh_id: "mesh:art-001", timestamp: 1700000000, signature: "cc".repeat(64) };

const NODE_TRUST = {
  node_did: "did:key:zabc123",
  ubuntu_score: 0.92,
  gate_events_total: 10,
  last_updated: 1700000000,
  mesh_version: "1.0",
};

const PROPOSAL = {
  proposal_id: "prop-abc",
  origin_node_did: "did:key:zabc123",
  artifact_id: "mesh:art-001",
  lineage_hops: [HOP],
  trust: { node_ubuntu: 0.92, artifact_confidence: null, label: "high-node" },
  timestamp: 1700000001,
  signature: "dd".repeat(64),
};

const VOTE = {
  proposal_id: "prop-abc",
  voter_node_did: "did:key:zabc123",
  vote: "approve",
  reason: "Self-approval (Phase 45 stub — quorum in Phase 46)",
  timestamp: 1700000002,
  signature: "ee".repeat(64),
};

const TASK = {
  task_id: "task-xyz",
  proposal_id: "prop-abc",
  assigned_node_did: "did:key:zabc123",
  artifact_id: "mesh:art-001",
  timestamp: 1700000003,
  signature: "ff".repeat(64),
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(SESSION);
  vi.mocked(prisma.externalRepo.findUnique).mockResolvedValue(REPO as never);
  vi.mocked(fetchMeshArtifact).mockResolvedValue(ARTIFACT_RESPONSE);
  vi.mocked(fetchMeshLineage).mockResolvedValue([HOP]);
  vi.mocked(fetchMeshNodeTrust).mockResolvedValue(NODE_TRUST);
  vi.mocked(proposeMance).mockResolvedValue(PROPOSAL as never);
  vi.mocked(voteMance).mockResolvedValue(VOTE as never);
  vi.mocked(assignForgeTask).mockResolvedValue(TASK);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("requestDistributedBuild", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(
      requestDistributedBuild("repo-1", "mesh:art-001")
    ).rejects.toThrow(/unauthorized/i);
  });

  it("throws when ExternalRepo not found", async () => {
    vi.mocked(prisma.externalRepo.findUnique).mockResolvedValue(null);
    await expect(
      requestDistributedBuild("nonexistent", "mesh:art-001")
    ).rejects.toThrow(/ExternalRepo not found/);
  });

  it("builds a valid proposal with lineage hops and trust signals", async () => {
    const result = await requestDistributedBuild("repo-1", "mesh:art-001");

    expect(proposeMance).toHaveBeenCalledWith(
      REPO.url,
      "mesh:art-001",
      [HOP],
      expect.objectContaining({ node_ubuntu: expect.any(Number), label: expect.any(String) }),
      expect.any(AbortSignal)
    );
    expect(result.proposal.proposal_id).toBe("prop-abc");
    expect(result.proposal.lineage_hops).toHaveLength(1);
  });

  it("returns a signed vote from the remote node", async () => {
    const result = await requestDistributedBuild("repo-1", "mesh:art-001");

    expect(voteMance).toHaveBeenCalledWith(
      REPO.url,
      "prop-abc",
      "approve",
      expect.stringContaining("stub"),
      expect.any(AbortSignal)
    );
    expect(result.vote.vote).toBe("approve");
    expect(result.vote.signature).toBe("ee".repeat(64));
  });

  it("assigns ForgeTask deterministically using trust score", async () => {
    const result = await requestDistributedBuild("repo-1", "mesh:art-001");

    expect(assignForgeTask).toHaveBeenCalledWith(
      REPO.url,
      "prop-abc",
      "mesh:art-001",
      expect.arrayContaining([
        expect.objectContaining({
          node_did: REPO.nodeId,
          trust: expect.objectContaining({ node_ubuntu: expect.any(Number) }),
        }),
      ]),
      expect.any(AbortSignal)
    );
    expect(result.task.assigned_node_did).toBe("did:key:zabc123");
    expect(result.task.signature).toBe("ff".repeat(64));
  });

  it("integrates trust signals from fetchMeshNodeTrust into the proposal", async () => {
    await requestDistributedBuild("repo-1", "mesh:art-001");

    const propCall = vi.mocked(proposeMance).mock.calls[0];
    const trust = propCall[3];
    expect(trust.node_ubuntu).toBe(0.92);   // from NODE_TRUST.ubuntu_score via combineTrustSignals
  });

  it("proceeds with empty lineage when fetchMeshLineage fails", async () => {
    vi.mocked(fetchMeshLineage).mockRejectedValue(new Error("network error"));

    const result = await requestDistributedBuild("repo-1", "mesh:art-001");

    const propCall = vi.mocked(proposeMance).mock.calls[0];
    const hops = propCall[2];
    expect(hops).toHaveLength(0);
    expect(result.proposal.proposal_id).toBe("prop-abc");
  });

  it("returns requestedAt as a Date", async () => {
    const result = await requestDistributedBuild("repo-1", "mesh:art-001");
    expect(result.requestedAt).toBeInstanceOf(Date);
  });
});
