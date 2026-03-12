import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    publicArtifact: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { prisma } = await import("@/lib/prisma");
const { getArtifactLineage } = await import("../get-artifact-lineage");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSummary(id: string, name = `Artifact ${id}`, version = "1.0.0") {
  return { id, name, version, authorId: null, createdAt: new Date("2026-01-01") };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: findMany returns empty array
  vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getArtifactLineage", () => {
  it("throws when artifact does not exist", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(null);

    await expect(getArtifactLineage("nonexistent")).rejects.toThrow(
      /artifact not found/i
    );
  });

  it("returns null parent and empty children when artifact has no lineage", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue({
      parentArtifactId: null,
    } as never);

    const result = await getArtifactLineage("art-1");

    expect(result.parent).toBeNull();
    expect(result.children).toEqual([]);
  });

  it("returns parent artifact when parentArtifactId is set", async () => {
    vi.mocked(prisma.publicArtifact.findUnique)
      // first call: fetch the artifact to get parentArtifactId
      .mockResolvedValueOnce({ parentArtifactId: "parent-1" } as never)
      // second call: fetch the parent
      .mockResolvedValueOnce(makeSummary("parent-1", "Parent Button") as never);

    const result = await getArtifactLineage("art-1");

    expect(result.parent).not.toBeNull();
    expect(result.parent?.id).toBe("parent-1");
    expect(result.parent?.name).toBe("Parent Button");
  });

  it("returns children (reverse lookup) for an artifact with remixes", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue({
      parentArtifactId: null,
    } as never);
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([
      makeSummary("child-1", "Child A"),
      makeSummary("child-2", "Child B"),
    ] as never);

    const result = await getArtifactLineage("art-root");

    expect(result.children).toHaveLength(2);
    expect(result.children[0].id).toBe("child-1");
    expect(result.children[1].id).toBe("child-2");
    // Verify the children query uses parentArtifactId filter
    expect(prisma.publicArtifact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { parentArtifactId: "art-root" },
      })
    );
  });

  it("returns both parent and children when both exist", async () => {
    vi.mocked(prisma.publicArtifact.findUnique)
      .mockResolvedValueOnce({ parentArtifactId: "parent-x" } as never)
      .mockResolvedValueOnce(makeSummary("parent-x", "Grand Parent") as never);
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([
      makeSummary("child-y", "My Fork"),
    ] as never);

    const result = await getArtifactLineage("art-middle");

    expect(result.parent?.id).toBe("parent-x");
    expect(result.children).toHaveLength(1);
    expect(result.children[0].id).toBe("child-y");
  });
});
