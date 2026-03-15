import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    publicArtifact: { findUnique: vi.fn() },
    agentRole: { findMany: vi.fn() },
    agentSkillMetric: { findFirst: vi.fn() },
    agentReputation: { findFirst: vi.fn() },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { prisma } = await import("@/lib/prisma");
const { routeCritiqueToSpecialist } = await import("../route-critique-to-specialist");

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue({ semanticSummary: null } as never);
  vi.mocked(prisma.agentRole.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.agentSkillMetric.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.agentReputation.findFirst).mockResolvedValue(null);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("routeCritiqueToSpecialist", () => {
  it("uses hint to determine category and returns specialist", async () => {
    vi.mocked(prisma.agentSkillMetric.findFirst).mockResolvedValue(
      { agentName: "Claude", score: 0.92 } as never
    );

    const result = await routeCritiqueToSpecialist({ artifactId: "art-1", hint: "Add aria-labels to buttons" });

    expect(result.recommendedAgent).toBe("Claude");
    expect(result.category).toBe("accessibility");
    expect(result.fromSpecialization).toBe(true);
    expect(result.score).toBe(0.92);
  });

  it("falls back to reputation when no skill metric exists", async () => {
    vi.mocked(prisma.agentSkillMetric.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.agentReputation.findFirst).mockResolvedValue(
      { agentName: "Grok", score: 0.85 } as never
    );

    const result = await routeCritiqueToSpecialist({ artifactId: "art-1", hint: "Improve performance" });

    expect(result.recommendedAgent).toBe("Grok");
    expect(result.fromSpecialization).toBe(false);
    expect(result.score).toBe(0.85);
  });

  it("falls back to Claude as last resort when no skill and no reputation", async () => {
    const result = await routeCritiqueToSpecialist({ artifactId: "art-1" });

    expect(result.recommendedAgent).toBe("Claude");
    expect(result.fromSpecialization).toBe(false);
  });

  it("excludes RESTRICTED agents from routing", async () => {
    vi.mocked(prisma.agentRole.findMany).mockResolvedValue(
      [{ agentName: "BadAgent" }] as never
    );
    vi.mocked(prisma.agentSkillMetric.findFirst).mockResolvedValue(
      { agentName: "Claude", score: 0.88 } as never
    );

    const result = await routeCritiqueToSpecialist({ artifactId: "art-1", hint: "Add aria labels" });

    // Verify restricted agents were excluded from the query
    expect(prisma.agentSkillMetric.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          agentName: expect.objectContaining({ notIn: ["BadAgent"] }),
        }),
      })
    );
    expect(result.recommendedAgent).toBe("Claude");
  });

  it("uses artifact semanticSummary when no hint provided", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(
      { semanticSummary: "Reusable component with abstraction layer" } as never
    );
    vi.mocked(prisma.agentSkillMetric.findFirst).mockResolvedValue(
      { agentName: "Claude", score: 0.75 } as never
    );

    const result = await routeCritiqueToSpecialist({ artifactId: "art-1" });

    expect(result.category).toBe("architecture");
    expect(result.fromSpecialization).toBe(true);
  });
});
