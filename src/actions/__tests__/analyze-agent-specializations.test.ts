import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findMany: vi.fn() },
    agentSkillMetric: { upsert: vi.fn() },
    governanceEvent: { create: vi.fn() },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { analyzeAgentSpecializations, classifySuggestion } = await import("../analyze-agent-specializations");

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ userId: "u1", email: "t@t.com", expiresAt: new Date(Date.now() + 3600_000) });
  vi.mocked(prisma.project.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.agentSkillMetric.upsert).mockResolvedValue({} as never);
  vi.mocked(prisma.governanceEvent.create).mockResolvedValue({ id: "evt-1" } as never);
});

// ── classifySuggestion ────────────────────────────────────────────────────────

describe("classifySuggestion", () => {
  it('classifies aria/label keywords as "accessibility"', () => {
    expect(classifySuggestion("Add aria-label to the button")).toBe("accessibility");
    expect(classifySuggestion("Make inputs accessible for screen reader")).toBe("accessibility");
  });

  it('classifies lazy/memo keywords as "performance"', () => {
    expect(classifySuggestion("Use lazy loading for images")).toBe("performance");
    expect(classifySuggestion("Wrap component in useMemo")).toBe("performance");
  });

  it('classifies animation/hover keywords as "ux"', () => {
    expect(classifySuggestion("Add hover animation to card")).toBe("ux");
    expect(classifySuggestion("Improve user experience with transitions")).toBe("ux");
  });

  it('classifies component/reusable keywords as "architecture"', () => {
    expect(classifySuggestion("Extract reusable component from form")).toBe("architecture");
    expect(classifySuggestion("Improve component abstraction")).toBe("architecture");
  });

  it('falls back to "architecture" when no keywords match', () => {
    expect(classifySuggestion("random improvement text")).toBe("architecture");
  });
});

// ── analyzeAgentSpecializations ───────────────────────────────────────────────

describe("analyzeAgentSpecializations", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(analyzeAgentSpecializations({ agentName: "Claude", projectId: "p1" })).rejects.toThrow(/unauthorized/i);
  });

  it("returns neutral scores (0.5) when agent has no variant history", async () => {
    const result = await analyzeAgentSpecializations({ agentName: "Claude", projectId: "p1" });
    expect(result.skills).toHaveLength(4);
    for (const skill of result.skills) {
      expect(skill.score).toBeCloseTo(0.5, 3); // (0+1)/(0+2)
      expect(skill.sampleCount).toBe(0);
    }
  });

  it("computes higher accessibility score when agent approved a11y suggestions", async () => {
    vi.mocked(prisma.project.findMany).mockResolvedValue([
      { name: "Button — Add aria-label to button", status: "APPROVED" },
      { name: "Form — Make inputs accessible", status: "APPROVED" },
    ] as never);

    const result = await analyzeAgentSpecializations({ agentName: "Claude", projectId: "p1" });
    const a11y = result.skills.find((s) => s.category === "accessibility");
    expect(a11y).toBeDefined();
    expect(a11y!.score).toBeGreaterThan(0.5);
    expect(a11y!.sampleCount).toBe(2);
  });

  it("lowers score when suggestions were rejected", async () => {
    vi.mocked(prisma.project.findMany).mockResolvedValue([
      { name: "Card — Add aria-label", status: "REJECTED" },
    ] as never);

    const result = await analyzeAgentSpecializations({ agentName: "Grok", projectId: "p1" });
    const a11y = result.skills.find((s) => s.category === "accessibility");
    // (0+1)/(1+2) = 0.333
    expect(a11y!.score).toBeCloseTo(0.333, 2);
  });

  it("upserts AgentSkillMetric for all 4 categories", async () => {
    await analyzeAgentSpecializations({ agentName: "Claude", projectId: "p1" });
    expect(prisma.agentSkillMetric.upsert).toHaveBeenCalledTimes(4);
  });

  it("logs AGENT_SPECIALIZATION_ANALYZED governance event", async () => {
    await analyzeAgentSpecializations({ agentName: "Claude", projectId: "p1" });
    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "AGENT_SPECIALIZATION_ANALYZED",
          projectId: "p1",
          details: expect.objectContaining({ agentName: "Claude" }),
        }),
      })
    );
  });
});
