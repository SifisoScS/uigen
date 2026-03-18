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

const RECEIPT = {
  task_id: "task-xyz",
  artifact_id: "mesh:art-001",
  runner_node_did: "did:key:zabc123",
  status: "success" as const,
  logs_hash: "ab".repeat(32),
  timestamp: 1700000005,
  signature: "22".repeat(64),
};

// ── runForgeTask — unit tests (direct fetch stub) ─────────────────────────────

describe("runForgeTask", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls POST /mesh/forge/run with the task body and returns BuildReceipt", async () => {
    const { runForgeTask: realRun } = await vi.importActual<typeof import("@/lib/forge-client")>("@/lib/forge-client");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => RECEIPT,
    }));

    const result = await realRun(BASE_URL, TASK);

    const fetchMock = vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/mesh/forge/run`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(TASK),
      })
    );
    expect(result.task_id).toBe("task-xyz");
    expect(result.status).toBe("success");
    expect(result.logs_hash).toBe("ab".repeat(32));
  });

  it("throws when the server returns a non-2xx status", async () => {
    const { runForgeTask: realRun } = await vi.importActual<typeof import("@/lib/forge-client")>("@/lib/forge-client");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }));

    await expect(realRun(BASE_URL, TASK)).rejects.toThrow(/Forge run failed: 500/);
  });
});

// ── requestDistributedBuild — forge runner integration tests ──────────────────

describe("requestDistributedBuild — forge runner integration", () => {
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
    vi.mocked(requestOrchestration).mockRejectedValue(new Error("network")); // best-effort: null
    vi.mocked(verifyEd25519).mockReturnValue(true);
  });

  it("includes signed BuildReceipt in result when forge run succeeds", async () => {
    vi.mocked(runForgeTask).mockResolvedValue(RECEIPT);

    const result = await requestDistributedBuild("repo-1", "mesh:art-001");

    expect(runForgeTask).toHaveBeenCalledWith(
      REPO.url,
      TASK,
      expect.any(AbortSignal)
    );
    expect(result.receipt).not.toBeNull();
    expect(result.receipt!.task_id).toBe("task-xyz");
    expect(result.receipt!.status).toBe("success");
  });

  it("verifies BuildReceipt signature against stored publicKey (§20.3 Rule 6)", async () => {
    vi.mocked(runForgeTask).mockResolvedValue(RECEIPT);

    await requestDistributedBuild("repo-1", "mesh:art-001");

    const expectedCanonical =
      `${RECEIPT.task_id}:${RECEIPT.artifact_id}:${RECEIPT.runner_node_did}` +
      `:${RECEIPT.status}:${RECEIPT.logs_hash}:${RECEIPT.timestamp}`;
    expect(verifyEd25519).toHaveBeenCalledWith(
      RECEIPT.signature,
      expectedCanonical,
      REPO.publicKey
    );
  });

  it("throws when BuildReceipt signature verification fails", async () => {
    vi.mocked(runForgeTask).mockResolvedValue(RECEIPT);
    vi.mocked(verifyEd25519).mockReturnValue(false);

    await expect(
      requestDistributedBuild("repo-1", "mesh:art-001")
    ).rejects.toThrow(/BuildReceipt signature verification failed/);
  });

  it("sets receipt to null when forge runner has a network failure", async () => {
    vi.mocked(runForgeTask).mockRejectedValue(new Error("connection refused"));

    const result = await requestDistributedBuild("repo-1", "mesh:art-001");

    expect(result.receipt).toBeNull();
    // other fields still populated
    expect(result.task.task_id).toBe("task-xyz");
  });

  it("skips signature verification when repo has no publicKey", async () => {
    vi.mocked(prisma.externalRepo.findUnique).mockResolvedValue({ ...REPO, publicKey: null } as never);
    vi.mocked(runForgeTask).mockResolvedValue(RECEIPT);

    const result = await requestDistributedBuild("repo-1", "mesh:art-001");

    // verifyEd25519 may be called for critique (skipped) but NOT for receipt when no publicKey
    // receipt should still be present
    expect(result.receipt).not.toBeNull();
    const receiptVerifyCalls = vi.mocked(verifyEd25519).mock.calls.filter(
      ([sig]) => sig === RECEIPT.signature
    );
    expect(receiptVerifyCalls).toHaveLength(0);
  });
});
