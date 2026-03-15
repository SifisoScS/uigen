import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/sifiso-gate", () => ({
  checkWithSovereignGate: vi.fn().mockResolvedValue({
    passed: true,
    ubuntu_score: 0.82,
    failed_predicates: [],
    rationale: "Gate bypassed — SIFISO_OS_URL not configured (development mode).",
    log_entry_id: "0".repeat(64),
    bypassed: true,
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    artifactRelation: { findFirst: vi.fn() },
    project: { update: vi.fn() },
    governanceEvent: { create: vi.fn() },
    agentReputation: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { checkWithSovereignGate } = await import("@/lib/sifiso-gate");
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
  vi.mocked(prisma.project.update).mockResolvedValue({ id: "proj-var-1", agentName: null } as never);
  vi.mocked(prisma.governanceEvent.create).mockResolvedValue({ id: "evt-1" } as never);
  vi.mocked(prisma.agentReputation.upsert).mockResolvedValue({} as never);
  vi.mocked(prisma.agentReputation.findUnique).mockResolvedValue({
    id: "rep-1", agentName: "Claude", score: 0.9, approvedCount: 0, rejectedCount: 0, updatedAt: new Date(),
  } as never);
  vi.mocked(prisma.agentReputation.update).mockResolvedValue({} as never);
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

  it("calls recordVariantOutcome (upserts agentReputation) when variant has agentName", async () => {
    vi.mocked(prisma.project.update).mockResolvedValue({
      id: "proj-var-1",
      agentName: "Claude",
    } as never);

    await approveVariant("proj-var-1", true);

    expect(prisma.agentReputation.upsert).toHaveBeenCalledOnce();
  });

  it("skips reputation update when variant has no agentName", async () => {
    vi.mocked(prisma.project.update).mockResolvedValue({
      id: "proj-var-1",
      agentName: null,
    } as never);

    await approveVariant("proj-var-1", true);

    expect(prisma.agentReputation.upsert).not.toHaveBeenCalled();
  });

  it("calls checkWithSovereignGate with variant_approve action", async () => {
    await approveVariant("proj-var-1", true);

    expect(checkWithSovereignGate).toHaveBeenCalledWith(
      expect.objectContaining({ uigen_action: "variant_approve", human_approved: true }),
      expect.objectContaining({ throwOnFail: false })
    );
  });

  it("stores ubuntuScore and gateLogEntryId in the governance event", async () => {
    await approveVariant("proj-var-1", true);

    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.objectContaining({
            ubuntuScore: 0.82,
            gateLogEntryId: "0".repeat(64),
          }),
        }),
      })
    );
  });

  it("proceeds even when gate passes=false (throwOnFail disabled for approvals)", async () => {
    vi.mocked(checkWithSovereignGate).mockResolvedValueOnce({
      passed: false,
      ubuntu_score: 0.45,
      failed_predicates: ["Ubuntu Alignment"],
      rationale: "Low alignment",
      log_entry_id: "f".repeat(64),
    });

    // Should not throw — approval proceeds regardless of gate score
    await expect(approveVariant("proj-var-1", true)).resolves.toEqual({ status: "APPROVED" });
  });
});
