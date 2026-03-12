import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    publicArtifact: {
      findMany: vi.fn(),
    },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { prisma } = await import("@/lib/prisma");
const { GET } = await import("../route");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeArtifact(overrides: Record<string, unknown> = {}) {
  return {
    id: "art-1",
    name: "My Button",
    version: "1.0.0",
    description: "A nice button",
    previewImage: null,
    remixCount: 3,
    authorId: "user-abc",
    createdAt: new Date("2026-01-01"),
    parentArtifactId: null,
    manifest: {
      registryTags: ["button", "ui"],
      governancePolicy: { policyType: "HUMAN_ONLY" },
    },
    ...overrides,
  };
}

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/registry");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default second call (parent batch lookup) returns empty
  vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/registry", () => {
  it("returns published artifacts with ancestry fields", async () => {
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([
      makeArtifact(),
    ] as never);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].name).toBe("My Button");
    expect(json.items[0].remixCount).toBe(3);
    expect(json.items[0].tags).toEqual(["button", "ui"]);
    expect(json.items[0].policyType).toBe("HUMAN_ONLY");
    expect(json.items[0].parentArtifactId).toBeNull();
    expect(json.items[0].parentArtifactName).toBeNull();
    expect(json.total).toBe(1);
    expect(json.hasMore).toBe(false);
  });

  it("resolves parentArtifactName via batch lookup", async () => {
    vi.mocked(prisma.publicArtifact.findMany)
      // First call: list artifacts
      .mockResolvedValueOnce([
        makeArtifact({ parentArtifactId: "parent-99" }),
      ] as never)
      // Second call: batch parent lookup
      .mockResolvedValueOnce([{ id: "parent-99", name: "Original Card" }] as never);

    const res = await GET(makeRequest());
    const json = await res.json();
    expect(json.items[0].parentArtifactId).toBe("parent-99");
    expect(json.items[0].parentArtifactName).toBe("Original Card");
  });

  it("filters by search term (name match)", async () => {
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([
      makeArtifact({ name: "Pricing Table", description: "A pricing grid" }),
      makeArtifact({ id: "art-2", name: "Nav Bar", description: "Top nav" }),
    ] as never);

    const res = await GET(makeRequest({ search: "pricing" }));
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].name).toBe("Pricing Table");
  });

  it("filters by tag", async () => {
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([
      makeArtifact({ manifest: { registryTags: ["button"], governancePolicy: { policyType: "HUMAN_ONLY" } } }),
      makeArtifact({ id: "art-2", manifest: { registryTags: ["chart"], governancePolicy: { policyType: "HUMAN_ONLY" } } }),
    ] as never);

    const res = await GET(makeRequest({ tags: "chart" }));
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].tags).toContain("chart");
  });

  it("sorts by remixCount when sortBy=remixCount", async () => {
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);

    await GET(makeRequest({ sortBy: "remixCount" }));

    expect(prisma.publicArtifact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { remixCount: "desc" },
      })
    );
  });

  it("returns empty items list when no artifacts exist", async () => {
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);

    const res = await GET(makeRequest());
    const json = await res.json();
    expect(json.items).toEqual([]);
    expect(json.total).toBe(0);
    expect(json.hasMore).toBe(false);
  });
});
