import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    publicArtifact: { findUnique: vi.fn() },
    project: { create: vi.fn() },
    artifactRelation: { create: vi.fn() },
    governanceEvent: { create: vi.fn() },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { generateSelectedVariants } = await import("../generate-selected-variants");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION = {
  userId: "user-abc",
  email: "test@example.com",
  expiresAt: new Date(Date.now() + 3_600_000),
};

const ARTIFACT = {
  id: "art-1",
  projectId: "proj-1",
  name: "AuthForm",
  filesData: "{}",
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(SESSION);
  vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(ARTIFACT as never);
  vi.mocked(prisma.project.create).mockResolvedValue({
    id: "proj-var-1",
    name: "AuthForm — Add aria-label",
  } as never);
  vi.mocked(prisma.artifactRelation.create).mockResolvedValue({ id: "rel-1" } as never);
  vi.mocked(prisma.governanceEvent.create).mockResolvedValue({ id: "evt-1" } as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("generateSelectedVariants", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await expect(
      generateSelectedVariants({
        artifactId: "art-1",
        suggestions: [{ text: "Add aria-label", agentName: "Claude" }],
      })
    ).rejects.toThrow(/unauthorized/i);
  });

  it("throws when artifact is not found", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(null);

    await expect(
      generateSelectedVariants({
        artifactId: "nonexistent",
        suggestions: [{ text: "Add aria-label", agentName: "Claude" }],
      })
    ).rejects.toThrow(/artifact not found/i);
  });

  it("throws when suggestions array is empty", async () => {
    await expect(
      generateSelectedVariants({ artifactId: "art-1", suggestions: [] })
    ).rejects.toThrow(/no suggestions/i);
  });

  it("creates one variant Project per suggestion", async () => {
    await generateSelectedVariants({
      artifactId: "art-1",
      suggestions: [
        { text: "Add aria-label", agentName: "Claude" },
        { text: "Use shadcn Button", agentName: "Grok" },
      ],
    });

    expect(prisma.project.create).toHaveBeenCalledTimes(2);
    expect(prisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: expect.stringContaining("Add aria-label"),
          data: "{}",
        }),
      })
    );
  });

  it("creates NEW_VARIANT_OF relation for each variant", async () => {
    await generateSelectedVariants({
      artifactId: "art-1",
      suggestions: [{ text: "Add aria-label", agentName: "Claude" }],
    });

    expect(prisma.artifactRelation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentType: "PublicArtifact",
          parentId: "art-1",
          childType: "Project",
          childId: "proj-var-1",
          relationType: "NEW_VARIANT_OF",
        }),
      })
    );
  });

  it("logs ARTIFACT_VARIANT_CREATED governance event per variant", async () => {
    await generateSelectedVariants({
      artifactId: "art-1",
      suggestions: [{ text: "Add aria-label", agentName: "Claude" }],
    });

    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ARTIFACT_VARIANT_CREATED",
          projectId: "proj-1",
          actor: "claude",
          details: expect.objectContaining({
            parentId: "art-1",
            childId: "proj-var-1",
            suggestion: "Add aria-label",
          }),
        }),
      })
    );
  });

  it("returns variantIds for all created variants", async () => {
    const result = await generateSelectedVariants({
      artifactId: "art-1",
      suggestions: [
        { text: "Add aria-label", agentName: "Claude" },
        { text: "Use shadcn Button", agentName: "Grok" },
      ],
    });

    expect(result.variantIds).toHaveLength(2);
    expect(result.variantIds[0]).toBe("proj-var-1");
  });
});
