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

vi.mock("@/lib/ed25519", () => ({
  verifyEd25519: vi.fn().mockReturnValue(true),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { fetchMeshArtifact, fetchMeshLineage, fetchMeshNodeTrust, fetchMeshArtifactTrust } = await import("@/lib/mesh-client");
const { verifyEd25519 } = await import("@/lib/ed25519");
const { fetchMeshArtifactAction } = await import("../fetch-mesh-artifact");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION = {
  userId: "u1",
  email: "t@t.com",
  expiresAt: new Date(Date.now() + 3_600_000),
};

const REPO = {
  id: "repo-1",
  name: "Sifiso OS Node",
  url: "https://sifiso.example.com",
  nodeId: "did:key:zabc123",
  publicKey: "bb".repeat(32),   // §17 — 64-char hex Ed25519 public key
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
  content: JSON.stringify({ blueprint_id: "bp-1", mesh_id: "mesh:art-001" }),
  signature: "sig-stub-sha256",
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(SESSION);
  vi.mocked(prisma.externalRepo.findUnique).mockResolvedValue(REPO as never);
  vi.mocked(fetchMeshArtifact).mockResolvedValue(ARTIFACT_RESPONSE);
  vi.mocked(fetchMeshLineage).mockResolvedValue([]);
  vi.mocked(fetchMeshNodeTrust).mockRejectedValue(new Error("not available"));
  vi.mocked(fetchMeshArtifactTrust).mockRejectedValue(new Error("not available"));
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("fetchMeshArtifactAction", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await expect(
      fetchMeshArtifactAction("repo-1", "mesh:art-001")
    ).rejects.toThrow(/unauthorized/i);
  });

  it("throws when ExternalRepo is not found", async () => {
    vi.mocked(prisma.externalRepo.findUnique).mockResolvedValue(null);

    await expect(
      fetchMeshArtifactAction("nonexistent", "mesh:art-001")
    ).rejects.toThrow(/ExternalRepo not found/);
  });

  it("fetches artifact successfully and returns summary, content, and fetchedAt", async () => {
    const result = await fetchMeshArtifactAction("repo-1", "mesh:art-001");

    expect(result.repoId).toBe("repo-1");
    expect(result.repoName).toBe("Sifiso OS Node");
    expect(result.nodeId).toBe("did:key:zabc123");
    expect(result.response.summary.artifact_id).toBe("mesh:art-001");
    expect(result.response.summary.origin_node_did).toBe("did:key:zabc123");
    expect(result.response.summary.lineage_hops).toEqual([{ node_did: "did:key:zabc123", mesh_id: "mesh:art-001", timestamp: 1700000000, signature: "cc".repeat(64) }]);
    expect(result.fetchedAt).toBeInstanceOf(Date);
  });

  it("throws when the Mesh artifact response is missing a signature", async () => {
    vi.mocked(fetchMeshArtifact).mockResolvedValue({
      ...ARTIFACT_RESPONSE,
      signature: "",
    });

    await expect(
      fetchMeshArtifactAction("repo-1", "mesh:art-001")
    ).rejects.toThrow(/Missing signature/);
  });

  it("throws when fetchMeshArtifact rejects (network error)", async () => {
    vi.mocked(fetchMeshArtifact).mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      fetchMeshArtifactAction("repo-1", "mesh:art-001")
    ).rejects.toThrow(/Mesh artifact fetch failed/);
  });

  it("throws when artifact signature verification fails (§17.5 Rule 4)", async () => {
    vi.mocked(verifyEd25519).mockReturnValueOnce(false);

    await expect(
      fetchMeshArtifactAction("repo-1", "mesh:art-001")
    ).rejects.toThrow(/Artifact signature verification failed/);
  });

  it("skips signature verification when repo has no publicKey", async () => {
    vi.mocked(prisma.externalRepo.findUnique).mockResolvedValue({
      ...REPO,
      publicKey: null,
    } as never);
    // verifyEd25519 still returns true but should not be called
    vi.mocked(verifyEd25519).mockReturnValue(true);

    const result = await fetchMeshArtifactAction("repo-1", "mesh:art-001");
    expect(result.repoId).toBe("repo-1");
    expect(verifyEd25519).not.toHaveBeenCalled();
  });
});
