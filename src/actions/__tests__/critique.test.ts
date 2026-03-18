import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks for critique-client unit tests ──────────────────────────────────────

// (fetch is stubbed per-test for client-level tests)

// ── Mocks for requestDistributedBuild integration tests ──────────────────────

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
}));

vi.mock("@/lib/mance-client", () => ({
  proposeMance: vi.fn(),
  voteMance: vi.fn(),
  assignForgeTask: vi.fn(),
}));

vi.mock("@/lib/critique-client", () => ({
  submitCritique: vi.fn(),
  getCritiqueAggregate: vi.fn(),
}));

vi.mock("@/lib/forge-client", () => ({
  runForgeTask: vi.fn(),
}));

vi.mock("@/lib/orchestrator-client", () => ({
  requestOrchestration: vi.fn(),
}));

vi.mock("@/lib/ed25519", () => ({
  verifyEd25519: vi.fn(),
}));

vi.mock("@/lib/trust-signals", () => ({
  combineTrustSignals: vi.fn(() => ({
    node_ubuntu: 0.9,
    artifact_confidence: null,
    label: "high-node",
  })),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { submitCritique: submitCritiqueClient, getCritiqueAggregate } =
  await import("@/lib/critique-client");
const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { fetchMeshArtifact, fetchMeshLineage, fetchMeshNodeTrust } =
  await import("@/lib/mesh-client");
const { proposeMance, voteMance, assignForgeTask } =
  await import("@/lib/mance-client");
const { runForgeTask } = await import("@/lib/forge-client");
const { requestOrchestration } = await import("@/lib/orchestrator-client");
const { verifyEd25519 } = await import("@/lib/ed25519");
const { requestDistributedBuild } = await import("../request-distributed-build");

// ── Shared fixtures ───────────────────────────────────────────────────────────

const BASE_URL = "https://sifiso.example.com";

const SESSION = { userId: "u1", email: "t@t.com", expiresAt: new Date(Date.now() + 3_600_000) };

const REPO = {
  id: "repo-1",
  name: "Sifiso OS Node",
  url: BASE_URL,
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
    timestamp: 1700000000,
  },
  content: JSON.stringify({ mesh_id: "mesh:art-001" }),
  signature: "aa".repeat(64),
};

const HOP = { node_did: "did:key:zabc123", mesh_id: "mesh:art-001", timestamp: 1700000000, signature: "cc".repeat(64) };
const NODE_TRUST = { node_did: "did:key:zabc123", ubuntu_score: 0.9, gate_events_total: 10, last_updated: 1700000000, mesh_version: "1.0" };

const PROPOSAL = {
  proposal_id: "prop-abc",
  origin_node_did: "did:key:zabc123",
  artifact_id: "mesh:art-001",
  lineage_hops: [HOP],
  trust: { node_ubuntu: 0.9, artifact_confidence: null, label: "high-node" },
  timestamp: 1700000001,
  signature: "dd".repeat(64),
};

const VOTE = {
  proposal_id: "prop-abc",
  voter_node_did: "did:key:zabc123",
  vote: "approve",
  reason: "Self-approval (Phase 45 stub — quorum in Phase 49)",
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

const CRITIQUE_SCORE = {
  proposal_id: "prop-abc",
  artifact_id: "mesh:art-001",
  critic_node_did: "did:key:zabc123",
  score: 0.9,
  comment: "Self-critique (Phase 46 stub)",
  timestamp: 1700000004,
  signature: "11".repeat(64),
};

const CRITIQUE_AGGREGATE = {
  proposal_id: "prop-abc",
  average_score: 0.9,
  count: 1,
};

// ── submitCritique — unit tests (direct fetch stub) ───────────────────────────

describe("submitCritique", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends payload to /mesh/critique/submit and returns CritiqueScore", async () => {
    const { submitCritique: realSubmit } = await vi.importActual<typeof import("@/lib/critique-client")>("@/lib/critique-client");
    const mockScore = { ...CRITIQUE_SCORE };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockScore,
    }));

    const result = await realSubmit(BASE_URL, "prop-abc", "mesh:art-001", 0.9, "good");

    const fetchMock = vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/mesh/critique/submit`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ proposal_id: "prop-abc", artifact_id: "mesh:art-001", score: 0.9, comment: "good" }),
      })
    );
    expect(result.proposal_id).toBe("prop-abc");
    expect(result.score).toBe(0.9);
  });

  it("getCritiqueAggregate fetches aggregate from /mesh/critique/aggregate/{id}", async () => {
    const { getCritiqueAggregate: realAggregate } = await vi.importActual<typeof import("@/lib/critique-client")>("@/lib/critique-client");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => CRITIQUE_AGGREGATE,
    }));

    const result = await realAggregate(BASE_URL, "prop-abc");

    const fetchMock = vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/mesh/critique/aggregate/prop-abc`,
      expect.objectContaining({ method: "GET" })
    );
    expect(result.average_score).toBe(0.9);
    expect(result.count).toBe(1);
  });

  it("validates score range — throws for score > 1.0 before fetching", async () => {
    const { submitCritique: realSubmit } = await vi.importActual<typeof import("@/lib/critique-client")>("@/lib/critique-client");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      realSubmit(BASE_URL, "p1", "a1", 1.5, "out of range")
    ).rejects.toThrow(/score must be between/);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ── requestDistributedBuild — critique integration tests ──────────────────────

describe("requestDistributedBuild — critique integration", () => {
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
    vi.mocked(submitCritiqueClient).mockResolvedValue(CRITIQUE_SCORE);
    vi.mocked(getCritiqueAggregate).mockResolvedValue(CRITIQUE_AGGREGATE);
    vi.mocked(runForgeTask).mockRejectedValue(new Error("network")); // best-effort: null
    vi.mocked(requestOrchestration).mockRejectedValue(new Error("network")); // best-effort: null
    vi.mocked(verifyEd25519).mockReturnValue(true);
  });

  it("includes critique and aggregate in result when critique succeeds", async () => {
    const result = await requestDistributedBuild("repo-1", "mesh:art-001");

    expect(submitCritiqueClient).toHaveBeenCalledWith(
      REPO.url,
      "prop-abc",
      "mesh:art-001",
      0.9,
      expect.stringContaining("stub"),
      expect.any(AbortSignal)
    );
    expect(result.critique).not.toBeNull();
    expect(result.critique!.score).toBe(0.9);
    expect(result.critiqueAggregate).not.toBeNull();
    expect(result.critiqueAggregate!.count).toBe(1);
  });

  it("handles aggregate failure gracefully — critique null on network error", async () => {
    vi.mocked(submitCritiqueClient).mockRejectedValue(new Error("network timeout"));

    const result = await requestDistributedBuild("repo-1", "mesh:art-001");

    expect(result.critique).toBeNull();
    expect(result.critiqueAggregate).toBeNull();
    // proposal and task still succeed
    expect(result.proposal.proposal_id).toBe("prop-abc");
    expect(result.task.task_id).toBe("task-xyz");
  });

  it("re-throws CritiqueScore signature verification failure", async () => {
    vi.mocked(verifyEd25519).mockReturnValue(false);

    await expect(
      requestDistributedBuild("repo-1", "mesh:art-001")
    ).rejects.toThrow(/CritiqueScore signature verification failed/);
  });
});
