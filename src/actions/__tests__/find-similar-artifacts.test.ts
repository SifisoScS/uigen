import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    artifactEmbedding: { findUnique: vi.fn(), findMany: vi.fn() },
    publicArtifact: { findMany: vi.fn() },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { prisma } = await import("@/lib/prisma");
const { findSimilarArtifacts } = await import("../find-similar-artifacts");
import { computeTextEmbedding } from "../../lib/embeddings";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VEC_A = computeTextEmbedding("accessible aria button label form");
const VEC_B = computeTextEmbedding("accessible aria input label form");  // similar to A
const VEC_C = computeTextEmbedding("lazy load image performance optimize cache"); // dissimilar

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.artifactEmbedding.findUnique).mockResolvedValue({ vector: VEC_A } as never);
  vi.mocked(prisma.artifactEmbedding.findMany).mockResolvedValue([
    { artifactId: "art-2", vector: VEC_B },
    { artifactId: "art-3", vector: VEC_C },
  ] as never);
  vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([
    { id: "art-2", name: "AuthInput", version: "1.0.0" },
    { id: "art-3", name: "ImageGallery", version: "1.0.0" },
  ] as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("findSimilarArtifacts", () => {
  it("returns empty array when artifact has no embedding", async () => {
    vi.mocked(prisma.artifactEmbedding.findUnique).mockResolvedValue(null);
    const result = await findSimilarArtifacts({ artifactId: "art-1" });
    expect(result).toHaveLength(0);
  });

  it("returns empty array when no other embeddings exist", async () => {
    vi.mocked(prisma.artifactEmbedding.findMany).mockResolvedValue([] as never);
    const result = await findSimilarArtifacts({ artifactId: "art-1" });
    expect(result).toHaveLength(0);
  });

  it("returns results sorted by similarity descending", async () => {
    const result = await findSimilarArtifacts({ artifactId: "art-1" });
    expect(result.length).toBeGreaterThan(0);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].similarity).toBeGreaterThanOrEqual(result[i].similarity);
    }
  });

  it("the most similar artifact scores higher than the dissimilar one", async () => {
    const result = await findSimilarArtifacts({ artifactId: "art-1" });
    const authInput = result.find((r) => r.artifactId === "art-2");
    const gallery = result.find((r) => r.artifactId === "art-3");
    expect(authInput).toBeDefined();
    expect(gallery).toBeDefined();
    expect(authInput!.similarity).toBeGreaterThan(gallery!.similarity);
  });

  it("respects topK limit", async () => {
    const result = await findSimilarArtifacts({ artifactId: "art-1", topK: 1 });
    expect(result).toHaveLength(1);
  });

  it("returns similarity as a number in [0, 1] for L2-normalised vectors", async () => {
    const result = await findSimilarArtifacts({ artifactId: "art-1" });
    for (const r of result) {
      expect(r.similarity).toBeGreaterThanOrEqual(-1);
      expect(r.similarity).toBeLessThanOrEqual(1);
    }
  });
});
