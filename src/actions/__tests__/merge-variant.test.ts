import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    artifactRelation: { findFirst: vi.fn() },
    project: { findUnique: vi.fn(), update: vi.fn() },
    publicArtifact: { findUnique: vi.fn() },
    governanceEvent: { create: vi.fn() },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { mergeVariant } = await import("../merge-variant");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION = {
  userId: "user-abc",
  email: "test@example.com",
  expiresAt: new Date(Date.now() + 3_600_000),
};

const RELATION = {
  id: "rel-1",
  parentType: "PublicArtifact",
  parentId: "art-1",
  childType: "Project",
  childId: "proj-var-1",
  relationType: "NEW_VARIANT_OF",
  createdAt: new Date("2026-01-01"),
};

const VARIANT_PROJECT = {
  id: "proj-var-1",
  status: "APPROVED",
};

const ARTIFACT = {
  id: "art-1",
  projectId: "orig-proj-1",
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(SESSION);
  vi.mocked(prisma.artifactRelation.findFirst).mockResolvedValue(RELATION as never);
  vi.mocked(prisma.project.findUnique).mockResolvedValue(VARIANT_PROJECT as never);
  vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(ARTIFACT as never);
  vi.mocked(prisma.project.update).mockResolvedValue({ id: "orig-proj-1" } as never);
  vi.mocked(prisma.governanceEvent.create).mockResolvedValue({ id: "evt-1" } as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("mergeVariant", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await expect(
      mergeVariant({ originalArtifactId: "art-1", variantProjectId: "proj-var-1" })
    ).rejects.toThrow(/unauthorized/i);
  });

  it("throws when variant is not linked to the artifact", async () => {
    vi.mocked(prisma.artifactRelation.findFirst).mockResolvedValue(null);

    await expect(
      mergeVariant({ originalArtifactId: "art-1", variantProjectId: "proj-var-1" })
    ).rejects.toThrow(/not linked/i);
  });

  it("throws when variant project is not found", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue(null);

    await expect(
      mergeVariant({ originalArtifactId: "art-1", variantProjectId: "proj-var-1" })
    ).rejects.toThrow(/not found/i);
  });

  it("throws when variant status is not APPROVED", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue({
      id: "proj-var-1",
      status: "DRAFT",
    } as never);

    await expect(
      mergeVariant({ originalArtifactId: "art-1", variantProjectId: "proj-var-1" })
    ).rejects.toThrow(/approved/i);
  });

  it("throws when original artifact is not found", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(null);

    await expect(
      mergeVariant({ originalArtifactId: "art-1", variantProjectId: "proj-var-1" })
    ).rejects.toThrow(/artifact not found/i);
  });

  it("updates original project with mergedFromVariantId and mergedAt", async () => {
    await mergeVariant({ originalArtifactId: "art-1", variantProjectId: "proj-var-1" });

    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "orig-proj-1" },
        data: expect.objectContaining({
          mergedFromVariantId: "proj-var-1",
          mergedAt: expect.any(Date),
        }),
      })
    );
  });

  it("logs ARTIFACT_VARIANT_MERGED governance event", async () => {
    await mergeVariant({ originalArtifactId: "art-1", variantProjectId: "proj-var-1" });

    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ARTIFACT_VARIANT_MERGED",
          projectId: "orig-proj-1",
          actor: "user-abc",
          details: expect.objectContaining({
            variantProjectId: "proj-var-1",
            originalArtifactId: "art-1",
          }),
        }),
      })
    );
  });

  it("returns { mergedAt } as a Date", async () => {
    const result = await mergeVariant({
      originalArtifactId: "art-1",
      variantProjectId: "proj-var-1",
    });

    expect(result.mergedAt).toBeInstanceOf(Date);
  });
});
