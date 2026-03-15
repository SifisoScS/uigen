import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    artifactRelation: { findFirst: vi.fn() },
    project: { update: vi.fn() },
    governanceEvent: { create: vi.fn() },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { approveVariant } = await import("../approve-variant");

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

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(SESSION);
  vi.mocked(prisma.artifactRelation.findFirst).mockResolvedValue(RELATION as never);
  vi.mocked(prisma.project.update).mockResolvedValue({ id: "proj-var-1" } as never);
  vi.mocked(prisma.governanceEvent.create).mockResolvedValue({ id: "evt-1" } as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("approveVariant", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await expect(approveVariant("proj-var-1")).rejects.toThrow(/unauthorized/i);
  });

  it("throws 'Not a variant project' when no NEW_VARIANT_OF relation exists", async () => {
    vi.mocked(prisma.artifactRelation.findFirst).mockResolvedValue(null);

    await expect(approveVariant("not-a-variant")).rejects.toThrow(/not a variant/i);
  });

  it("updates project status to APPROVED", async () => {
    await approveVariant("proj-var-1", true);

    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "proj-var-1" },
        data: expect.objectContaining({
          status: "APPROVED",
          approvedBy: "user-abc",
        }),
      })
    );
  });

  it("updates project status to REJECTED", async () => {
    await approveVariant("proj-var-1", false);

    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "REJECTED",
          approvedAt: null,
        }),
      })
    );
  });

  it("logs ARTIFACT_VARIANT_APPROVED governance event", async () => {
    await approveVariant("proj-var-1", true);

    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ARTIFACT_VARIANT_APPROVED",
          projectId: "proj-var-1",
          actor: "user-abc",
          details: expect.objectContaining({
            parentArtifactId: "art-1",
            approved: true,
          }),
        }),
      })
    );
  });

  it("logs ARTIFACT_VARIANT_REJECTED governance event", async () => {
    await approveVariant("proj-var-1", false);

    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ARTIFACT_VARIANT_REJECTED",
          projectId: "proj-var-1",
          actor: "user-abc",
          details: expect.objectContaining({ approved: false }),
        }),
      })
    );
  });

  it("returns { status: 'APPROVED' } when approved", async () => {
    const result = await approveVariant("proj-var-1", true);

    expect(result).toEqual({ status: "APPROVED" });
  });

  it("returns { status: 'REJECTED' } when rejected", async () => {
    const result = await approveVariant("proj-var-1", false);

    expect(result).toEqual({ status: "REJECTED" });
  });

  it("defaults to approved=true when second arg is omitted", async () => {
    await approveVariant("proj-var-1");

    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "APPROVED" }),
      })
    );
  });
});
