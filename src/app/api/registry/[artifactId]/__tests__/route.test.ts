import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    publicArtifact: {
      findUnique: vi.fn(),
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
    name: "AuthForm",
    version: "1.0.0",
    description: "Accessible auth form",
    semanticSummary: "A login form with dark mode",
    componentTree: { type: "JSXElement", name: "Card" },
    styleSignature: { classes: ["flex"], colors: ["bg-violet-500"], spacing: [], usedComponents: [] },
    remixCount: 3,
    authorId: "user-abc",
    createdAt: new Date("2026-01-15T12:00:00Z"),
    ...overrides,
  };
}

function makeRequest(artifactId: string) {
  return new NextRequest(`http://localhost/api/registry/${artifactId}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/registry/[artifactId]", () => {
  it("returns artifact metadata for a valid id", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(makeArtifact() as never);

    const res = await GET(makeRequest("art-1"), { params: Promise.resolve({ artifactId: "art-1" }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.id).toBe("art-1");
    expect(json.name).toBe("AuthForm");
    expect(json.version).toBe("1.0.0");
    expect(json.description).toBe("Accessible auth form");
    expect(json.semanticSummary).toBe("A login form with dark mode");
    expect(json.remixCount).toBe(3);
    expect(json.createdAt).toBe("2026-01-15T12:00:00.000Z");
  });

  it("returns 404 when artifact does not exist", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(null);

    const res = await GET(makeRequest("nonexistent"), { params: Promise.resolve({ artifactId: "nonexistent" }) });
    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json.error).toBe("Artifact not found");
  });

  it("queries prisma with the correct artifactId", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(makeArtifact() as never);

    await GET(makeRequest("art-42"), { params: Promise.resolve({ artifactId: "art-42" }) });

    expect(prisma.publicArtifact.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "art-42" } })
    );
  });

  it("coerces null description and semanticSummary to null in response", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(
      makeArtifact({ description: null, semanticSummary: null }) as never
    );

    const res = await GET(makeRequest("art-1"), { params: Promise.resolve({ artifactId: "art-1" }) });
    const json = await res.json();
    expect(json.description).toBeNull();
    expect(json.semanticSummary).toBeNull();
  });

  it("does NOT include filesData in the response (external federation safety)", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(makeArtifact() as never);

    const res = await GET(makeRequest("art-1"), { params: Promise.resolve({ artifactId: "art-1" }) });
    const json = await res.json();
    expect(json).not.toHaveProperty("filesData");
    expect(json).not.toHaveProperty("manifest");
  });
});
