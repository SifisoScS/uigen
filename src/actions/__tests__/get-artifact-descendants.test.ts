import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    publicArtifact: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { prisma } = await import("@/lib/prisma");
const { getArtifactDescendants } = await import("../get-artifact-descendants");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ROOT = { id: "root", name: "Button", version: "1.0.0", authorId: null, remixCount: 3, parentArtifactId: null, createdAt: new Date("2026-01-01") };
const CHILD_1 = { id: "c1", name: "Button", version: "1.1.0", authorId: "u1", remixCount: 1, parentArtifactId: "root", createdAt: new Date("2026-01-02") };
const CHILD_2 = { id: "c2", name: "Button", version: "1.2.0", authorId: "u2", remixCount: 0, parentArtifactId: "root", createdAt: new Date("2026-01-03") };
const GRANDCHILD = { id: "gc1", name: "Button", version: "1.1.1", authorId: "u3", remixCount: 0, parentArtifactId: "c1", createdAt: new Date("2026-01-04") };

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.publicArtifact.count).mockResolvedValue(0);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getArtifactDescendants", () => {
  it("throws when root artifact does not exist", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(null);
    await expect(getArtifactDescendants("nonexistent")).rejects.toThrow(/artifact not found/i);
  });

  it("returns empty descendants when root has no children", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(ROOT as never);
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);

    const result = await getArtifactDescendants("root");

    expect(result.rootId).toBe("root");
    expect(result.descendants).toHaveLength(0);
    expect(result.depthReached).toBe(false);
  });

  it("returns direct children at depth=1", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(ROOT as never);
    vi.mocked(prisma.publicArtifact.findMany).mockImplementation(((args: unknown) => {
      const where = (args as { where: { parentArtifactId: string } }).where;
      if (where.parentArtifactId === "root") return Promise.resolve([CHILD_1, CHILD_2]);
      return Promise.resolve([]);
    }) as never);

    const result = await getArtifactDescendants("root", 1);

    expect(result.descendants).toHaveLength(2);
    expect(result.descendants[0].id).toBe("c1");
    expect(result.descendants[0].depth).toBe(1);
    expect(result.descendants[1].id).toBe("c2");
    expect(result.descendants[1].depth).toBe(1);
  });

  it("walks grandchildren at depth=2", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(ROOT as never);
    vi.mocked(prisma.publicArtifact.findMany).mockImplementation(((args: unknown) => {
      const where = (args as { where: { parentArtifactId: string } }).where;
      if (where.parentArtifactId === "root") return Promise.resolve([CHILD_1]);
      if (where.parentArtifactId === "c1") return Promise.resolve([GRANDCHILD]);
      return Promise.resolve([]);
    }) as never);

    const result = await getArtifactDescendants("root", 2);

    expect(result.descendants).toHaveLength(2);
    const gc = result.descendants.find((d) => d.id === "gc1");
    expect(gc).toBeDefined();
    expect(gc!.depth).toBe(2);
  });

  it("does not revisit the same node (cycle guard)", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(ROOT as never);
    // c1 shows up as child of both root AND itself (simulated cycle)
    vi.mocked(prisma.publicArtifact.findMany).mockImplementation(((args: unknown) => {
      const where = (args as { where: { parentArtifactId: string } }).where;
      if (where.parentArtifactId === "root") return Promise.resolve([CHILD_1]);
      // Cycle: c1 reports itself as its own child
      if (where.parentArtifactId === "c1") return Promise.resolve([CHILD_1]);
      return Promise.resolve([]);
    }) as never);

    const result = await getArtifactDescendants("root", 3);

    // c1 should appear exactly once
    const c1Nodes = result.descendants.filter((d) => d.id === "c1");
    expect(c1Nodes).toHaveLength(1);
  });

  it("sets depthReached=true when children exist beyond the depth limit", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(ROOT as never);
    vi.mocked(prisma.publicArtifact.findMany).mockImplementation(((args: unknown) => {
      const where = (args as { where: { parentArtifactId: string } }).where;
      if (where.parentArtifactId === "root") return Promise.resolve([CHILD_1]);
      return Promise.resolve([]);
    }) as never);
    // Grandchild exists but depth=1 prevents walking there
    vi.mocked(prisma.publicArtifact.count).mockResolvedValue(1);

    const result = await getArtifactDescendants("root", 1);
    expect(result.depthReached).toBe(true);
  });
});
