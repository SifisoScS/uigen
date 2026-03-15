import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    publicArtifact: { findUnique: vi.fn() },
    agentInvocation: { create: vi.fn() },
    artifactRelation: { create: vi.fn() },
    governanceEvent: { create: vi.fn() },
  },
}));

vi.mock("@/lib/agent-reputation", () => ({
  getAgentReputationScore: vi.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { getAgentReputationScore } = await import("@/lib/agent-reputation");
const { coordinateCritiques } = await import("../coordinate-critiques");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION = {
  userId: "user-abc",
  email: "test@example.com",
  expiresAt: new Date(Date.now() + 3_600_000),
};

const ARTIFACT = { id: "art-1", projectId: "proj-1" };

const INVOCATION = {
  id: "inv-merged-1",
  agentName: "Grok",
  prompt: "Merge multi-agent critiques",
  critiqueJson: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

const CLAUDE_CRITIQUE = {
  agentName: "Claude",
  issues: ["Missing keyboard nav", "Low contrast"],
  suggestions: ["Add aria-label", "Use shadcn Button"],
  priority: 1,
  finalScore: 0.9,
  invocationId: "inv-1",
};

const GROK_CRITIQUE = {
  agentName: "Grok",
  // "Low contrast" is a duplicate from Claude
  issues: ["Custom dropdown lacks aria-expanded", "Low contrast"],
  // "Add aria-label" is a duplicate from Claude
  suggestions: ["Replace dropdown with shadcn Select", "Add aria-label"],
  priority: 2,
  finalScore: 0.425,
  invocationId: "inv-2",
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(SESSION);
  vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(ARTIFACT as never);
  vi.mocked(prisma.agentInvocation.create).mockResolvedValue(INVOCATION as never);
  vi.mocked(prisma.artifactRelation.create).mockResolvedValue({ id: "rel-1" } as never);
  vi.mocked(prisma.governanceEvent.create).mockResolvedValue({ id: "evt-1" } as never);
  // Default: Claude=0.9, Grok=0.85, unknown=0.7
  vi.mocked(getAgentReputationScore).mockImplementation(async (name: string) =>
    name === "Claude" ? 0.9 : name === "Grok" ? 0.85 : 0.7
  );
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("coordinateCritiques", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await expect(
      coordinateCritiques({ artifactId: "art-1", agentCritiques: [CLAUDE_CRITIQUE] })
    ).rejects.toThrow(/unauthorized/i);
  });

  it("throws when agentCritiques array is empty", async () => {
    await expect(
      coordinateCritiques({ artifactId: "art-1", agentCritiques: [] })
    ).rejects.toThrow(/no agent critiques/i);
  });

  it("throws when artifact is not found", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(null);

    await expect(
      coordinateCritiques({ artifactId: "nonexistent", agentCritiques: [CLAUDE_CRITIQUE] })
    ).rejects.toThrow(/artifact not found/i);
  });

  it("deduplicates issues across agents in the merged critique", async () => {
    const result = await coordinateCritiques({
      artifactId: "art-1",
      agentCritiques: [CLAUDE_CRITIQUE, GROK_CRITIQUE],
    });

    // "Low contrast" appears in both agents — should be present exactly once
    const issueCount = result.mergedCritique.issues.filter((i) => i === "Low contrast").length;
    expect(issueCount).toBe(1);
    // All unique issues are present
    expect(result.mergedCritique.issues).toContain("Missing keyboard nav");
    expect(result.mergedCritique.issues).toContain("Custom dropdown lacks aria-expanded");
  });

  it("deduplicates suggestions across agents in the merged critique", async () => {
    const result = await coordinateCritiques({
      artifactId: "art-1",
      agentCritiques: [CLAUDE_CRITIQUE, GROK_CRITIQUE],
    });

    // "Add aria-label" appears in both agents — should be present exactly once
    const suggCount = result.mergedCritique.suggestions.filter((s) => s === "Add aria-label").length;
    expect(suggCount).toBe(1);
    // All unique suggestions are present
    expect(result.mergedCritique.suggestions).toContain("Use shadcn Button");
    expect(result.mergedCritique.suggestions).toContain("Replace dropdown with shadcn Select");
  });

  it("sets mergedBy to Grok in the merged critique", async () => {
    const result = await coordinateCritiques({
      artifactId: "art-1",
      agentCritiques: [CLAUDE_CRITIQUE],
    });

    expect(result.mergedCritique.mergedBy).toBe("Grok");
  });

  it("creates AgentInvocation with agentName Grok and merged critiqueJson", async () => {
    await coordinateCritiques({
      artifactId: "art-1",
      agentCritiques: [CLAUDE_CRITIQUE, GROK_CRITIQUE],
    });

    expect(prisma.agentInvocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agentName: "Grok",
          prompt: "Merge multi-agent critiques",
          critiqueJson: expect.objectContaining({
            mergedBy: "Grok",
            issues: expect.any(Array),
            suggestions: expect.any(Array),
          }),
        }),
      })
    );
  });

  it("logs ARTIFACT_CRITIQUE_MERGED governance event with agentCount and mergedBy", async () => {
    await coordinateCritiques({
      artifactId: "art-1",
      agentCritiques: [CLAUDE_CRITIQUE, GROK_CRITIQUE],
    });

    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ARTIFACT_CRITIQUE_MERGED",
          projectId: "proj-1",
          actor: "human-user",
          details: expect.objectContaining({
            agentCount: 2,
            mergedBy: "Grok",
          }),
        }),
      })
    );
  });

  it("returns invocationId from created AgentInvocation", async () => {
    const result = await coordinateCritiques({
      artifactId: "art-1",
      agentCritiques: [CLAUDE_CRITIQUE],
    });

    expect(result.invocationId).toBe("inv-merged-1");
  });

  // ── Reputation-weighted behaviour ─────────────────────────────────────────

  it("weightedSuggestions are sorted by score descending (higher-rep agent first)", async () => {
    const result = await coordinateCritiques({
      artifactId: "art-1",
      agentCritiques: [CLAUDE_CRITIQUE, GROK_CRITIQUE],
    });

    const scores = result.mergedCritique.weightedSuggestions.map((ws) => ws.score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });

  it("shared suggestion has contributors from all agents that proposed it", async () => {
    const result = await coordinateCritiques({
      artifactId: "art-1",
      agentCritiques: [CLAUDE_CRITIQUE, GROK_CRITIQUE],
    });

    // "Add aria-label" appears in both CLAUDE_CRITIQUE and GROK_CRITIQUE
    const shared = result.mergedCritique.weightedSuggestions.find(
      (ws) => ws.text === "Add aria-label"
    );
    expect(shared).toBeDefined();
    expect(shared!.contributors).toContain("Claude");
    expect(shared!.contributors).toContain("Grok");
    // Score should be max of Claude(0.9) and Grok(0.85) = 0.9
    expect(shared!.score).toBe(0.9);
  });

  it("topAgentName reflects the agent with the highest reputation score", async () => {
    const result = await coordinateCritiques({
      artifactId: "art-1",
      agentCritiques: [CLAUDE_CRITIQUE, GROK_CRITIQUE],
    });

    // Claude=0.9 > Grok=0.85 → topAgentName should be "Claude"
    expect(result.mergedCritique.topAgentName).toBe("Claude");
  });

  it("logs topAgentName and topAgentScore in the governance event details", async () => {
    await coordinateCritiques({
      artifactId: "art-1",
      agentCritiques: [CLAUDE_CRITIQUE, GROK_CRITIQUE],
    });

    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.objectContaining({
            topAgentName: "Claude",
            topAgentScore: 0.9,
          }),
        }),
      })
    );
  });

  it("calls getAgentReputationScore for each unique contributing agent", async () => {
    await coordinateCritiques({
      artifactId: "art-1",
      agentCritiques: [CLAUDE_CRITIQUE, GROK_CRITIQUE],
    });

    expect(getAgentReputationScore).toHaveBeenCalledWith("Claude");
    expect(getAgentReputationScore).toHaveBeenCalledWith("Grok");
  });
});
