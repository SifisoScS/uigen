import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { fetchMeshArtifact, fetchMeshLineage, fetchMeshNodeTrust } =
  await import("@/lib/mesh-client");
const { proposeMance, voteMance, assignForgeTask } =
  await import("@/lib/mance-client");
const { submitCritique, getCritiqueAggregate } =
  await import("@/lib/critique-client");
const { runForgeTask } = await import("@/lib/forge-client");
const { requestOrchestration } = await import("@/lib/orchestrator-client");
const { verifyEd25519 } = await import("@/lib/ed25519");
const { requestDistributedBuild } = await import("../request-distributed-build");

// ── Fixtures ──────────────────────────────────────────────────────────────────

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

const ORCHESTRATION_DECISION = {
  artifact_id: "mesh:art-001",
  candidate_nodes: ["did:key:zbest999", "did:key:zabc123"],
  policy: {
    min_ubuntu_score: 0.5,
    max_peers: 5,
    retry_on_failure: true,
    prefer_local_node: true,
    timestamp: 1700000006,
  },
  timestamp: 1700000006,
  signature: "33".repeat(64),
};

// ── requestOrchestration — unit tests (direct fetch stub) ─────────────────────

describe("requestOrchestration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls POST /mesh/orchestrate with artifact_id and returns OrchestrationDecision", async () => {
    const { requestOrchestration: realOrchestrate } = await vi.importActual<typeof import("@/lib/orchestrator-client")>("@/lib/orchestrator-client");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ORCHESTRATION_DECISION,
    }));

    const result = await realOrchestrate(BASE_URL, "mesh:art-001");

    const fetchMock = vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/mesh/orchestrate`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ artifact_id: "mesh:art-001" }),
      })
    );
    expect(result.artifact_id).toBe("mesh:art-001");
    expect(result.candidate_nodes).toHaveLength(2);
  });

  it("parses OrchestrationDecision including policy defaults", async () => {
    const { requestOrchestration: realOrchestrate } = await vi.importActual<typeof import("@/lib/orchestrator-client")>("@/lib/orchestrator-client");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ORCHESTRATION_DECISION,
    }));

    const result = await realOrchestrate(BASE_URL, "mesh:art-001");

    expect(result.policy.min_ubuntu_score).toBe(0.5);
    expect(result.policy.max_peers).toBe(5);
    expect(result.policy.retry_on_failure).toBe(true);
    expect(result.policy.prefer_local_node).toBe(true);
    expect(result.signature).toBe("33".repeat(64));
  });
});

// ── requestDistributedBuild — orchestrator integration tests ──────────────────

describe("requestDistributedBuild — orchestrator integration", () => {
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
    vi.mocked(submitCritique).mockRejectedValue(new Error("network")); // best-effort: null
    vi.mocked(getCritiqueAggregate).mockRejectedValue(new Error("network")); // best-effort: null
    vi.mocked(runForgeTask).mockRejectedValue(new Error("network")); // best-effort: null
    vi.mocked(verifyEd25519).mockReturnValue(true);
  });

  it("uses first orchestration candidate_node as the ForgeTask assignment target", async () => {
    vi.mocked(requestOrchestration).mockResolvedValue(ORCHESTRATION_DECISION);

    await requestDistributedBuild("repo-1", "mesh:art-001");

    // assignForgeTask should receive the first candidate from orchestration
    const [, , , peers] = vi.mocked(assignForgeTask).mock.calls[0];
    expect((peers[0] as { node_did: string }).node_did).toBe("did:key:zbest999");
  });

  it("falls back to repo.nodeId when orchestration fails", async () => {
    vi.mocked(requestOrchestration).mockRejectedValue(new Error("orchestration unavailable"));

    await requestDistributedBuild("repo-1", "mesh:art-001");

    const [, , , peers] = vi.mocked(assignForgeTask).mock.calls[0];
    expect((peers[0] as { node_did: string }).node_did).toBe(REPO.nodeId);
  });

  it("includes orchestration decision in the result when successful", async () => {
    vi.mocked(requestOrchestration).mockResolvedValue(ORCHESTRATION_DECISION);

    const result = await requestDistributedBuild("repo-1", "mesh:art-001");

    expect(result.orchestration).not.toBeNull();
    expect(result.orchestration!.candidate_nodes).toContain("did:key:zbest999");
    expect(result.orchestration!.policy.max_peers).toBe(5);
  });

  it("sets orchestration to null when orchestration is best-effort and fails", async () => {
    vi.mocked(requestOrchestration).mockRejectedValue(new Error("timeout"));

    const result = await requestDistributedBuild("repo-1", "mesh:art-001");

    expect(result.orchestration).toBeNull();
    // other fields still present
    expect(result.proposal.proposal_id).toBe("prop-abc");
    expect(result.task.task_id).toBe("task-xyz");
  });

  it("produces deterministic assignment — always picks first candidate from decision", async () => {
    const DECISION_A = { ...ORCHESTRATION_DECISION, candidate_nodes: ["did:key:z_alpha", "did:key:z_beta"] };
    const DECISION_B = { ...ORCHESTRATION_DECISION, candidate_nodes: ["did:key:z_alpha", "did:key:z_beta"] };

    vi.mocked(requestOrchestration).mockResolvedValueOnce(DECISION_A);
    const resultA = await requestDistributedBuild("repo-1", "mesh:art-001");

    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(SESSION);
    vi.mocked(prisma.externalRepo.findUnique).mockResolvedValue(REPO as never);
    vi.mocked(fetchMeshArtifact).mockResolvedValue(ARTIFACT_RESPONSE);
    vi.mocked(fetchMeshLineage).mockResolvedValue([HOP]);
    vi.mocked(fetchMeshNodeTrust).mockResolvedValue(NODE_TRUST);
    vi.mocked(proposeMance).mockResolvedValue(PROPOSAL as never);
    vi.mocked(voteMance).mockResolvedValue(VOTE as never);
    vi.mocked(assignForgeTask).mockResolvedValue(TASK);
    vi.mocked(submitCritique).mockRejectedValue(new Error("network"));
    vi.mocked(getCritiqueAggregate).mockRejectedValue(new Error("network"));
    vi.mocked(runForgeTask).mockRejectedValue(new Error("network"));
    vi.mocked(verifyEd25519).mockReturnValue(true);
    vi.mocked(requestOrchestration).mockResolvedValueOnce(DECISION_B);

    const resultB = await requestDistributedBuild("repo-1", "mesh:art-001");

    // Both calls should use the same first candidate
    const peersA = vi.mocked(assignForgeTask).mock.calls[0][3];
    expect((peersA[0] as { node_did: string }).node_did).toBe("did:key:z_alpha");
    expect(resultA.orchestration!.candidate_nodes[0]).toBe(resultB.orchestration!.candidate_nodes[0]);
  });

  it("calls requestOrchestration with correct baseUrl and artifactId", async () => {
    vi.mocked(requestOrchestration).mockResolvedValue(ORCHESTRATION_DECISION);

    await requestDistributedBuild("repo-1", "mesh:art-001");

    expect(requestOrchestration).toHaveBeenCalledWith(
      REPO.url,
      "mesh:art-001",
      expect.any(AbortSignal)
    );
  });
});
