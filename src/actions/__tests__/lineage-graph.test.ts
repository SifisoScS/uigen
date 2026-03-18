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
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { fetchMeshArtifact, fetchMeshLineage } = await import("@/lib/mesh-client");
const { fetchMeshArtifactAction } = await import("../fetch-mesh-artifact");
import { buildLineageGraph } from "@/lib/lineage-graph";
import type { LineageHop } from "@/lib/mesh-client";

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
};

const HOP_1: LineageHop = {
  node_did: "did:key:zabc123",
  mesh_id: "mesh:art-001",
  timestamp: 1_700_000_000,
  signature: "",
};

const HOP_2: LineageHop = {
  node_did: "did:key:zdef456",
  mesh_id: "mesh:art-001",
  timestamp: 1_700_000_100,
  signature: "",
};

const ARTIFACT_RESPONSE = {
  summary: {
    artifact_id: "mesh:art-001",
    origin_node_did: "did:key:zabc123",
    lineage_hops: [HOP_1],
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
  vi.mocked(fetchMeshLineage).mockResolvedValue([HOP_1]);
});

// ── buildLineageGraph unit tests ──────────────────────────────────────────────

describe("buildLineageGraph", () => {
  it("returns empty graph for empty hops", () => {
    const graph = buildLineageGraph("mesh:art-001", []);
    expect(graph.artifactId).toBe("mesh:art-001");
    expect(graph.hopCount).toBe(0);
    expect(graph.originNodeDid).toBeNull();
    expect(graph.nodes).toHaveLength(0);
  });

  it("builds a single-hop graph correctly", () => {
    const graph = buildLineageGraph("mesh:art-001", [HOP_1]);
    expect(graph.hopCount).toBe(1);
    expect(graph.originNodeDid).toBe("did:key:zabc123");
    expect(graph.nodes[0]).toMatchObject({
      hopIndex: 0,
      node_did: "did:key:zabc123",
      mesh_id: "mesh:art-001",
      timestamp: 1_700_000_000,
    });
  });

  it("preserves hop order and assigns correct hopIndex for multiple hops", () => {
    const graph = buildLineageGraph("mesh:art-001", [HOP_1, HOP_2]);
    expect(graph.hopCount).toBe(2);
    expect(graph.nodes[0].hopIndex).toBe(0);
    expect(graph.nodes[1].hopIndex).toBe(1);
    expect(graph.nodes[1].node_did).toBe("did:key:zdef456");
  });
});

// ── fetchMeshArtifactAction with lineage ─────────────────────────────────────

describe("fetchMeshArtifactAction — lineage integration", () => {
  it("returns lineageGraph with single hop on successful lineage fetch", async () => {
    const result = await fetchMeshArtifactAction("repo-1", "mesh:art-001");

    expect(result.lineageGraph.hopCount).toBe(1);
    expect(result.lineageGraph.originNodeDid).toBe("did:key:zabc123");
    expect(result.lineageGraph.nodes[0].node_did).toBe("did:key:zabc123");
  });

  it("returns empty lineageGraph when lineage fetch fails", async () => {
    vi.mocked(fetchMeshLineage).mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await fetchMeshArtifactAction("repo-1", "mesh:art-001");

    expect(result.lineageGraph.hopCount).toBe(0);
    expect(result.lineageGraph.originNodeDid).toBeNull();
    // artifact response still returned successfully
    expect(result.response.signature).toBe("sig-stub-sha256");
  });
});
