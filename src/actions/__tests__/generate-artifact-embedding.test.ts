import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    publicArtifact: { findUnique: vi.fn() },
    artifactEmbedding: { upsert: vi.fn() },
    governanceEvent: { create: vi.fn() },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { generateArtifactEmbedding } = await import("../generate-artifact-embedding");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION = { userId: "u1", email: "t@t.com", expiresAt: new Date(Date.now() + 3_600_000) };

const ARTIFACT = {
  id: "art-1",
  projectId: "proj-1",
  name: "AuthForm",
  description: "An accessible auth form",
  semanticSummary: "Authentication form with email and password inputs",
  componentTree: { type: "Form", children: [{ type: "Input" }, { type: "Button" }] },
  styleSignature: { classes: ["flex", "gap-4", "bg-blue-500"], usedComponents: ["Button", "Input"], colors: ["bg-blue-500"] },
};

const EMBEDDING_RECORD = { id: "emb-1", modelVersion: "stub-v1" };

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(SESSION);
  vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(ARTIFACT as never);
  vi.mocked(prisma.artifactEmbedding.upsert).mockResolvedValue(EMBEDDING_RECORD as never);
  vi.mocked(prisma.governanceEvent.create).mockResolvedValue({ id: "evt-1" } as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("generateArtifactEmbedding", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(generateArtifactEmbedding({ artifactId: "art-1" })).rejects.toThrow(/unauthorized/i);
  });

  it("throws when artifact does not exist", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(null);
    await expect(generateArtifactEmbedding({ artifactId: "bad" })).rejects.toThrow(/artifact not found/i);
  });

  it("returns embeddingId and correct dimension", async () => {
    const result = await generateArtifactEmbedding({ artifactId: "art-1" });
    expect(result.embeddingId).toBe("emb-1");
    expect(result.dimension).toBe(64);
    expect(result.modelVersion).toBe("stub-v1");
    expect(result.artifactId).toBe("art-1");
  });

  it("upserts ArtifactEmbedding with a 64-dim vector", async () => {
    await generateArtifactEmbedding({ artifactId: "art-1" });

    expect(prisma.artifactEmbedding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { artifactId: "art-1" },
        create: expect.objectContaining({
          vector: expect.arrayContaining([expect.any(Number)]),
        }),
      })
    );

    const call = vi.mocked(prisma.artifactEmbedding.upsert).mock.calls[0][0];
    expect((call.create as { vector: number[] }).vector).toHaveLength(64);
  });

  it("logs ARTIFACT_EMBEDDING_GENERATED governance event", async () => {
    await generateArtifactEmbedding({ artifactId: "art-1" });

    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ARTIFACT_EMBEDDING_GENERATED",
          projectId: "proj-1",
          details: expect.objectContaining({ dimension: 64 }),
        }),
      })
    );
  });
});
