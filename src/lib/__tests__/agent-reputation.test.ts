import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentReputation: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    governanceEvent: { create: vi.fn() },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { prisma } = await import("@/lib/prisma");
const { getAgentReputationScore, recordVariantOutcome } = await import(
  "@/lib/agent-reputation"
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRepRecord(
  agentName: string,
  approvedCount: number,
  rejectedCount: number,
  score: number,
) {
  return { id: "rep-1", agentName, score, approvedCount, rejectedCount, updatedAt: new Date() };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.agentReputation.upsert).mockResolvedValue({} as never);
  vi.mocked(prisma.agentReputation.update).mockResolvedValue({} as never);
  vi.mocked(prisma.governanceEvent.create).mockResolvedValue({ id: "evt-1" } as never);
});

// ── getAgentReputationScore ───────────────────────────────────────────────────

describe("getAgentReputationScore", () => {
  it("returns DB score when record exists", async () => {
    vi.mocked(prisma.agentReputation.findFirst).mockResolvedValue(
      makeRepRecord("Claude", 5, 1, 0.92) as never,
    );

    const score = await getAgentReputationScore("Claude");

    expect(score).toBe(0.92);
  });

  it("falls back to REPUTATION_SEED when no DB record and agent is known", async () => {
    vi.mocked(prisma.agentReputation.findFirst).mockResolvedValue(null);

    const score = await getAgentReputationScore("Claude");

    expect(score).toBe(0.9);
  });

  it("returns DEFAULT_REPUTATION for unknown agent with no DB record", async () => {
    vi.mocked(prisma.agentReputation.findFirst).mockResolvedValue(null);

    const score = await getAgentReputationScore("Unknown");

    expect(score).toBe(0.7);
  });
});

// ── recordVariantOutcome ──────────────────────────────────────────────────────

describe("recordVariantOutcome", () => {
  it("upserts record then updates with correct score on approval (0 prior counts)", async () => {
    vi.mocked(prisma.agentReputation.findUnique).mockResolvedValue(
      makeRepRecord("Claude", 0, 0, 0.9) as never,
    );

    await recordVariantOutcome("Claude", true, "proj-1", "art-1");

    // newApproved=1, newRejected=0 → newScore=(1+1)/(1+0+2)=2/3≈0.6667
    expect(prisma.agentReputation.upsert).toHaveBeenCalledOnce();
    expect(prisma.agentReputation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { agentName: "Claude" },
        data: expect.objectContaining({
          approvedCount: 1,
          rejectedCount: 0,
          score: expect.closeTo(0.6667, 3),
        }),
      }),
    );
  });

  it("uses correct Laplace formula for rejection (0 prior counts)", async () => {
    vi.mocked(prisma.agentReputation.findUnique).mockResolvedValue(
      makeRepRecord("Claude", 0, 0, 0.9) as never,
    );

    await recordVariantOutcome("Claude", false, "proj-1", "art-1");

    // newApproved=0, newRejected=1 → newScore=(0+1)/(0+1+2)=1/3≈0.3333
    expect(prisma.agentReputation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approvedCount: 0,
          rejectedCount: 1,
          score: expect.closeTo(0.3333, 3),
        }),
      }),
    );
  });

  it("converges toward 1.0 with repeated approvals (9 prior → 10 total)", async () => {
    vi.mocked(prisma.agentReputation.findUnique).mockResolvedValue(
      makeRepRecord("Claude", 9, 0, 0.9) as never,
    );

    await recordVariantOutcome("Claude", true, "proj-1", "art-1");

    // newApproved=10, newRejected=0 → newScore=(10+1)/(10+0+2)=11/12≈0.9167
    expect(prisma.agentReputation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approvedCount: 10,
          score: expect.closeTo(0.9167, 3),
        }),
      }),
    );
  });

  it("logs AGENT_REPUTATION_UPDATED governance event with required fields", async () => {
    vi.mocked(prisma.agentReputation.findUnique).mockResolvedValue(
      makeRepRecord("Grok", 0, 0, 0.85) as never,
    );

    await recordVariantOutcome("Grok", true, "proj-1", "art-42");

    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "AGENT_REPUTATION_UPDATED",
          projectId: "proj-1",
          actor: "system",
          details: expect.objectContaining({
            agentName: "Grok",
            approved: true,
            parentArtifactId: "art-42",
            newScore: expect.any(Number),
          }),
        }),
      }),
    );
  });
});
