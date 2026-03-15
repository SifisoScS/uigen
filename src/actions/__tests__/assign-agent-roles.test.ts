import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentReputation: { findMany: vi.fn() },
    agentRole: { findUnique: vi.fn(), upsert: vi.fn() },
    governanceEvent: { create: vi.fn() },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { assignAgentRoles, AUTO_PUBLISH_THRESHOLD, REVIEWER_THRESHOLD } = await import("../assign-agent-roles");

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ userId: "u1", email: "t@t.com", expiresAt: new Date(Date.now() + 3600_000) });
  vi.mocked(prisma.agentReputation.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.agentRole.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.agentRole.upsert).mockResolvedValue({} as never);
  vi.mocked(prisma.governanceEvent.create).mockResolvedValue({ id: "evt-1" } as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("assignAgentRoles", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(assignAgentRoles({ projectId: "p1" })).rejects.toThrow(/unauthorized/i);
  });

  it("returns empty assigned when no agents exist", async () => {
    const result = await assignAgentRoles({ projectId: "p1" });
    expect(result.assigned).toHaveLength(0);
  });

  it(`assigns AUTO_PUBLISH when score >= ${AUTO_PUBLISH_THRESHOLD}`, async () => {
    vi.mocked(prisma.agentReputation.findMany).mockResolvedValue([
      { agentName: "Claude", score: 0.92 },
    ] as never);

    const result = await assignAgentRoles({ projectId: "p1" });
    expect(result.assigned[0].role).toBe("AUTO_PUBLISH");
  });

  it(`assigns REVIEWER when score >= ${REVIEWER_THRESHOLD} and < ${AUTO_PUBLISH_THRESHOLD}`, async () => {
    vi.mocked(prisma.agentReputation.findMany).mockResolvedValue([
      { agentName: "Grok", score: 0.65 },
    ] as never);

    const result = await assignAgentRoles({ projectId: "p1" });
    expect(result.assigned[0].role).toBe("REVIEWER");
  });

  it(`assigns RESTRICTED when score < ${REVIEWER_THRESHOLD}`, async () => {
    vi.mocked(prisma.agentReputation.findMany).mockResolvedValue([
      { agentName: "WeakAgent", score: 0.3 },
    ] as never);

    const result = await assignAgentRoles({ projectId: "p1" });
    expect(result.assigned[0].role).toBe("RESTRICTED");
  });

  it("assigns correct roles to multiple agents", async () => {
    vi.mocked(prisma.agentReputation.findMany).mockResolvedValue([
      { agentName: "Claude", score: 0.9 },
      { agentName: "Grok", score: 0.6 },
      { agentName: "WeakBot", score: 0.2 },
    ] as never);

    const result = await assignAgentRoles({ projectId: "p1" });
    const roles = Object.fromEntries(result.assigned.map((a) => [a.agentName, a.role]));
    expect(roles["Claude"]).toBe("AUTO_PUBLISH");
    expect(roles["Grok"]).toBe("REVIEWER");
    expect(roles["WeakBot"]).toBe("RESTRICTED");
  });

  it("emits AGENT_ROLE_ASSIGNED only when role changes", async () => {
    vi.mocked(prisma.agentReputation.findMany).mockResolvedValue([
      { agentName: "Claude", score: 0.9 },
    ] as never);
    // Existing role matches new role → no event
    vi.mocked(prisma.agentRole.findUnique).mockResolvedValue({ role: "AUTO_PUBLISH" } as never);

    await assignAgentRoles({ projectId: "p1" });
    expect(prisma.governanceEvent.create).not.toHaveBeenCalled();
  });

  it("emits AGENT_ROLE_ASSIGNED when role is new (no prior record)", async () => {
    vi.mocked(prisma.agentReputation.findMany).mockResolvedValue([
      { agentName: "Claude", score: 0.9 },
    ] as never);
    vi.mocked(prisma.agentRole.findUnique).mockResolvedValue(null);

    await assignAgentRoles({ projectId: "p1" });
    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "AGENT_ROLE_ASSIGNED",
          details: expect.objectContaining({ agentName: "Claude", newRole: "AUTO_PUBLISH" }),
        }),
      })
    );
  });
});
