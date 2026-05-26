import { describe, it, expect, vi, beforeEach } from "vitest";
import { clusterArtifacts } from "@/actions/cluster-artifacts";
import { EMBEDDING_DIM, computeTextEmbedding } from "@/lib/embeddings";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    artifactEmbedding: {
      findMany: vi.fn(),
    },
  },
}));

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const mockSession = vi.mocked(getSession);
const mockFindMany = vi.mocked(prisma.artifactEmbedding.findMany);

const SESSION = { userId: "u1", email: "u@test.com" };

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Create a 3-d unit vector pointing in a given octant */
function vec(x: number, y: number, z: number): number[] {
  const mag = Math.sqrt(x * x + y * y + z * z);
  return [x / mag, y / mag, z / mag];
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("clusterArtifacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.mockResolvedValue(SESSION as never);
  });

  it("throws Unauthorized when no session", async () => {
    mockSession.mockResolvedValue(null);
    await expect(clusterArtifacts({})).rejects.toThrow("Unauthorized");
  });

  it("returns empty clusters when no embeddings exist", async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await clusterArtifacts({ k: 3 });
    expect(result.totalArtifacts).toBe(0);
    expect(result.clusters).toHaveLength(0);
  });

  it("clamps k to the number of embeddings when k > count", async () => {
    mockFindMany.mockResolvedValue([
      { artifactId: "a1", vector: vec(1, 0, 0) },
    ] as never);
    const result = await clusterArtifacts({ k: 10 });
    expect(result.k).toBe(1);
    expect(result.totalArtifacts).toBe(1);
    expect(result.clusters).toHaveLength(1);
  });

  it("accounts for all artifacts across clusters", async () => {
    // Use real 64-dim embeddings so kMeans centroid recomputation works in EMBEDDING_DIM space
    const vecA1 = computeTextEmbedding("login authentication form password");
    const vecA2 = computeTextEmbedding("signup registration user credentials");
    const vecB1 = computeTextEmbedding("pricing table tier monthly annual");
    const vecB2 = computeTextEmbedding("subscription plan billing cost");
    const vecC1 = computeTextEmbedding("dashboard chart metric analytics");
    const vecC2 = computeTextEmbedding("graph data visualisation statistics");

    mockFindMany.mockResolvedValue([
      { artifactId: "ax1", vector: vecA1 },
      { artifactId: "ax2", vector: vecA2 },
      { artifactId: "ay1", vector: vecB1 },
      { artifactId: "ay2", vector: vecB2 },
      { artifactId: "az1", vector: vecC1 },
      { artifactId: "az2", vector: vecC2 },
    ] as never);

    const result = await clusterArtifacts({ k: 3 });
    expect(result.k).toBe(3);
    expect(result.totalArtifacts).toBe(6);
    expect(result.clusters).toHaveLength(3);

    // All 6 artifact IDs should be distributed across the clusters
    const allIds = result.clusters.flatMap((c) => c.artifactIds).sort();
    expect(allIds).toEqual(["ax1", "ax2", "ay1", "ay2", "az1", "az2"].sort());

    // Total member count across all clusters equals total artifacts
    const totalMembers = result.clusters.reduce((sum, c) => sum + c.memberCount, 0);
    expect(totalMembers).toBe(6);
  });

  it("each cluster has a centroid of EMBEDDING_DIM length", async () => {
    mockFindMany.mockResolvedValue([
      { artifactId: "a1", vector: vec(1, 0, 0) },
      { artifactId: "a2", vector: vec(0, 1, 0) },
    ] as never);
    const result = await clusterArtifacts({ k: 2 });
    for (const cluster of result.clusters) {
      // kMeans always recomputes centroids in EMBEDDING_DIM space
      expect(cluster.centroid).toHaveLength(EMBEDDING_DIM);
    }
  });

  it("uses k=3 as default when k is not specified", async () => {
    mockFindMany.mockResolvedValue([
      { artifactId: "a1", vector: vec(1, 0, 0) },
      { artifactId: "a2", vector: vec(0, 1, 0) },
      { artifactId: "a3", vector: vec(0, 0, 1) },
    ] as never);
    const result = await clusterArtifacts({});
    expect(result.k).toBe(3);
  });
});
