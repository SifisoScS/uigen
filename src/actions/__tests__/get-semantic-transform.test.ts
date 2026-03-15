import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    semanticTransform: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { prisma } = await import("@/lib/prisma");
const { getSemanticTransform, getSemanticTransformsBySource } = await import(
  "../get-semantic-transform"
);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ROW = {
  id: "st-1",
  fromArtifactId: "art-1",
  toArtifactId: "art-2",
  addedComponents: ["Dialog"],
  removedComponents: ["Card"],
  modifiedProps: {},
  a11yDelta: 2,
  linesChanged: 10,
  createdAt: new Date("2026-01-01"),
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.semanticTransform.findUnique).mockResolvedValue(ROW as never);
  vi.mocked(prisma.semanticTransform.findMany).mockResolvedValue([ROW] as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getSemanticTransform", () => {
  it("returns null when no transform exists for the artifact", async () => {
    vi.mocked(prisma.semanticTransform.findUnique).mockResolvedValue(null);
    const result = await getSemanticTransform("art-unknown");
    expect(result).toBeNull();
  });

  it("returns the transform record when found", async () => {
    const result = await getSemanticTransform("art-2");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("st-1");
    expect(result!.fromArtifactId).toBe("art-1");
    expect(result!.toArtifactId).toBe("art-2");
  });

  it("maps addedComponents and removedComponents correctly", async () => {
    const result = await getSemanticTransform("art-2");
    expect(result!.addedComponents).toEqual(["Dialog"]);
    expect(result!.removedComponents).toEqual(["Card"]);
  });

  it("exposes a11yDelta and linesChanged", async () => {
    const result = await getSemanticTransform("art-2");
    expect(result!.a11yDelta).toBe(2);
    expect(result!.linesChanged).toBe(10);
  });
});

describe("getSemanticTransformsBySource", () => {
  it("returns empty array when no transforms from that artifact", async () => {
    vi.mocked(prisma.semanticTransform.findMany).mockResolvedValue([] as never);
    const result = await getSemanticTransformsBySource("art-none");
    expect(result).toHaveLength(0);
  });

  it("returns all transforms from the source artifact", async () => {
    const result = await getSemanticTransformsBySource("art-1");
    expect(result).toHaveLength(1);
    expect(result[0].toArtifactId).toBe("art-2");
  });

  it("queries by fromArtifactId with asc order", async () => {
    await getSemanticTransformsBySource("art-1");
    expect(prisma.semanticTransform.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { fromArtifactId: "art-1" },
        orderBy: { createdAt: "asc" },
      })
    );
  });
});
