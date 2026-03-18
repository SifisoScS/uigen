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

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const {
  fetchMeshArtifact,
  fetchMeshLineage,
  fetchMeshNodeTrust,
  fetchMeshArtifactTrust,
} = await import("@/lib/mesh-client");
const { fetchMeshArtifactAction } = await import("../fetch-mesh-artifact");
import { combineTrustSignals } from "@/lib/trust-signals";
import type { ArtifactTrustHint, NodeTrustSummary } from "@/lib/mesh-client";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION = { userId: "u1", email: "t@t.com", expiresAt: new Date(Date.now() + 3_600_000) };
const REPO = { id: "repo-1", name: "Sifiso OS", url: "https://sifiso.example.com", nodeId: "did:key:zabc123" };

const NODE_TRUST: NodeTrustSummary = {
  node_did: "did:key:zabc123",
  ubuntu_score: 0.9,
  gate_events_total: 10,
  last_updated: 1_700_000_000,
  mesh_version: "1.0",
};

const ARTIFACT_TRUST_HIGH: ArtifactTrustHint = {
  artifact_id: "mesh:art-001",
  node_did: "did:key:zabc123",
  trust_label: "high",
  confidence: 0.9,
  last_updated: 1_700_000_001,
};

const ARTIFACT_RESPONSE = {
  summary: {
    artifact_id: "mesh:art-001",
    origin_node_did: "did:key:zabc123",
    lineage_hops: [{ node_did: "did:key:zabc123", mesh_id: "mesh:art-001", timestamp: 1_700_000_000, signature: "" }],
    content_hash: "deadbeef".repeat(8),
    content_mime: "application/json",
    gate_log_merkle: "cafe1234".repeat(8),
    timestamp: Math.floor(Date.now() / 1000),
  },
  content: JSON.stringify({ blueprint_id: "bp-1", mesh_id: "mesh:art-001" }),
  signature: "sig-stub-sha256",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(SESSION);
  vi.mocked(prisma.externalRepo.findUnique).mockResolvedValue(REPO as never);
  vi.mocked(fetchMeshArtifact).mockResolvedValue(ARTIFACT_RESPONSE);
  vi.mocked(fetchMeshLineage).mockResolvedValue([]);
  vi.mocked(fetchMeshNodeTrust).mockResolvedValue(NODE_TRUST);
  vi.mocked(fetchMeshArtifactTrust).mockResolvedValue(ARTIFACT_TRUST_HIGH);
});

// ── combineTrustSignals unit tests ────────────────────────────────────────────

describe("combineTrustSignals", () => {
  it("node_only_high — ubuntu_score=0.9, no artifactHint → label 'high-node'", () => {
    const result = combineTrustSignals({ ...NODE_TRUST, ubuntu_score: 0.9 });
    expect(result.label).toBe("high-node");
    expect(result.artifact_confidence).toBeNull();
    expect(result.node_ubuntu).toBe(0.9);
  });

  it("node_only_low — ubuntu_score=0.2 → label 'low-node'", () => {
    const result = combineTrustSignals({ ...NODE_TRUST, ubuntu_score: 0.2 });
    expect(result.label).toBe("low-node");
  });

  it("with_artifact_high — node=0.9, artifact.confidence=0.9 → label 'high'", () => {
    const result = combineTrustSignals(
      { ...NODE_TRUST, ubuntu_score: 0.9 },
      { ...ARTIFACT_TRUST_HIGH, confidence: 0.9 }
    );
    expect(result.label).toBe("high");
    expect(result.artifact_confidence).toBe(0.9);
  });

  it("with_artifact_medium — node=0.6, artifact=0.4 → label 'medium'", () => {
    const result = combineTrustSignals(
      { ...NODE_TRUST, ubuntu_score: 0.6 },
      { ...ARTIFACT_TRUST_HIGH, confidence: 0.4 }
    );
    expect(result.label).toBe("medium");  // avg = 0.5
  });

  it("with_artifact_low — node=0.3, artifact=0.2 → label 'low'", () => {
    const result = combineTrustSignals(
      { ...NODE_TRUST, ubuntu_score: 0.3 },
      { ...ARTIFACT_TRUST_HIGH, confidence: 0.2 }
    );
    expect(result.label).toBe("low");  // avg = 0.25
  });
});

// ── fetchMeshArtifactAction trust integration ─────────────────────────────────

describe("fetchMeshArtifactAction — trust integration", () => {
  it("includes computed trust when all trust fetches succeed", async () => {
    const result = await fetchMeshArtifactAction("repo-1", "mesh:art-001");

    expect(result.trust).not.toBeNull();
    expect(result.trust!.node_ubuntu).toBe(0.9);
    expect(result.trust!.artifact_confidence).toBe(0.9);
    expect(result.trust!.label).toBe("high");
  });
});
