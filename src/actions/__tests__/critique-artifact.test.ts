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
    project: { create: vi.fn() },
    agentReputation: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => "mock-anthropic-model"),
}));

vi.mock("@/actions/route-critique-to-specialist", () => ({
  routeCritiqueToSpecialist: vi.fn().mockResolvedValue({
    recommendedAgent: "Claude",
    category: "accessibility",
    score: 0.85,
    fromSpecialization: false, // default: no reordering
  }),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { generateObject } = await import("ai");
const { routeCritiqueToSpecialist } = await import("@/actions/route-critique-to-specialist");
const { critiqueArtifact } = await import("../critique-artifact");

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
  semanticSummary: null,
  componentTree: null,
  styleSignature: null,
};

const INVOCATION = {
  id: "inv-1",
  agentName: "StubAgent",
  prompt: "Critique this UI component",
  critiqueJson: { suggestions: ["Add aria-label"], issues: ["Missing keyboard nav"] },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const VARIANT_PROJECT = {
  id: "proj-var-1",
  name: "AuthForm — Add aria-label",
  createdAt: new Date(),
  updatedAt: new Date(),
  userId: null,
  public: false,
  messages: "[]",
  data: "{}",
  forkedFromSnapshotId: null,
  remixedFromArtifactId: null,
  agentName: null,
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Ensure ANTHROPIC_API_KEY is absent so stub critique is used by default
  delete process.env.ANTHROPIC_API_KEY;
  vi.mocked(getSession).mockResolvedValue(SESSION);
  vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(ARTIFACT as never);
  vi.mocked(prisma.agentInvocation.create).mockResolvedValue(INVOCATION as never);
  vi.mocked(prisma.artifactRelation.create).mockResolvedValue({ id: "rel-1" } as never);
  vi.mocked(prisma.governanceEvent.create).mockResolvedValue({ id: "evt-1" } as never);
  vi.mocked(prisma.project.create).mockResolvedValue(VARIANT_PROJECT as never);
  vi.mocked(prisma.agentReputation.findFirst).mockResolvedValue(null);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("critiqueArtifact", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await expect(
      critiqueArtifact({ artifactId: "art-1" })
    ).rejects.toThrow(/unauthorized/i);
  });

  it("throws Artifact not found when artifact does not exist", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(null);

    await expect(
      critiqueArtifact({ artifactId: "nonexistent" })
    ).rejects.toThrow(/artifact not found/i);
  });

  it("creates AgentInvocation with agentName, prompt, and critiqueJson", async () => {
    await critiqueArtifact({
      artifactId: "art-1",
      agentName: "Grok",
      prompt: "Assess accessibility",
    });

    expect(prisma.agentInvocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agentName: "Grok",
          prompt: "Assess accessibility",
          critiqueJson: expect.objectContaining({
            suggestions: expect.any(Array),
            issues: expect.any(Array),
          }),
        }),
      })
    );
  });

  it("creates EVALUATED_BY ArtifactRelation linking invocation to artifact", async () => {
    await critiqueArtifact({ artifactId: "art-1" });

    expect(prisma.artifactRelation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentType: "AgentInvocation",
          parentId: "inv-1",
          childType: "PublicArtifact",
          childId: "art-1",
          relationType: "EVALUATED_BY",
        }),
      })
    );
  });

  it("logs ARTIFACT_CRITIQUE_CREATED governance event", async () => {
    await critiqueArtifact({ artifactId: "art-1", agentName: "StubAgent" });

    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ARTIFACT_CRITIQUE_CREATED",
          projectId: "proj-1",
          actor: "stubagent",
          details: expect.objectContaining({
            parentType: "AgentInvocation",
            parentId: "inv-1",
            childId: "art-1",
            relationType: "EVALUATED_BY",
          }),
        }),
      })
    );
  });

  it("returns invocationId from created AgentInvocation", async () => {
    const result = await critiqueArtifact({ artifactId: "art-1" });

    expect(result.invocationId).toBe("inv-1");
  });

  it("uses default agentName and prompt when omitted", async () => {
    await critiqueArtifact({ artifactId: "art-1" });

    expect(prisma.agentInvocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agentName: "StubAgent",
          prompt: expect.stringContaining("accessibility"),
        }),
      })
    );
  });

  it("creates one variant Project per suggestion in DEFAULT_CRITIQUE", async () => {
    // DEFAULT_CRITIQUE has 3 suggestions
    await critiqueArtifact({ artifactId: "art-1" });

    expect(prisma.project.create).toHaveBeenCalledTimes(3);
    expect(prisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: expect.stringContaining("Add aria-label"),
          data: "{}",
        }),
      })
    );
  });

  it("sets agentName on variant projects in single-agent mode", async () => {
    await critiqueArtifact({ artifactId: "art-1", agentName: "Claude" });

    expect(prisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ agentName: "Claude" }),
      })
    );
  });

  it("creates NEW_VARIANT_OF relation for each variant", async () => {
    await critiqueArtifact({ artifactId: "art-1" });

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
    await critiqueArtifact({ artifactId: "art-1", agentName: "StubAgent" });

    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ARTIFACT_VARIANT_CREATED",
          projectId: "proj-1",
          actor: "stubagent",
          details: expect.objectContaining({
            parentId: "art-1",
            childId: "proj-var-1",
            suggestion: expect.any(String),
          }),
        }),
      })
    );
  });

  it("returns variantIds matching created projects (one per suggestion)", async () => {
    const result = await critiqueArtifact({ artifactId: "art-1" });

    // DEFAULT_CRITIQUE has 3 suggestions → 3 variants
    expect(result.variantIds).toHaveLength(3);
    expect(result.variantIds[0]).toBe("proj-var-1");
  });

  it("uses real LLM generateObject when ANTHROPIC_API_KEY is set", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        issues: ["Issue from LLM"],
        suggestions: ["Suggestion from LLM"],
      },
    } as never);

    await critiqueArtifact({ artifactId: "art-1" });

    expect(generateObject).toHaveBeenCalled();
    expect(prisma.agentInvocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          critiqueJson: expect.objectContaining({
            issues: ["Issue from LLM"],
            suggestions: ["Suggestion from LLM"],
          }),
        }),
      })
    );
  });

  it("falls back to DEFAULT_CRITIQUE when LLM call throws", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.mocked(generateObject).mockRejectedValue(new Error("LLM error"));

    await critiqueArtifact({ artifactId: "art-1" });

    expect(prisma.agentInvocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          critiqueJson: expect.objectContaining({
            suggestions: expect.arrayContaining([expect.stringContaining("aria-label")]),
          }),
        }),
      })
    );
  });
});

// ── Multi-agent mode ───────────────────────────────────────────────────────────

describe("critiqueArtifact (multi-agent mode)", () => {
  it("creates one AgentInvocation per agent when agents array is provided", async () => {
    await critiqueArtifact({ artifactId: "art-1", agents: ["Claude", "Grok"] });

    // Two agents → two invocations
    expect(prisma.agentInvocation.create).toHaveBeenCalledTimes(2);
  });

  it("returns aggregatedCritiques with one entry per agent in order", async () => {
    const result = await critiqueArtifact({
      artifactId: "art-1",
      agents: ["Claude", "Grok"],
    });

    expect(result.aggregatedCritiques).toHaveLength(2);
    expect(result.aggregatedCritiques[0].agentName).toBe("Claude");
    expect(result.aggregatedCritiques[1].agentName).toBe("Grok");
  });

  it("assigns priority 1 to first agent and 2 to second agent", async () => {
    const result = await critiqueArtifact({
      artifactId: "art-1",
      agents: ["Claude", "Grok"],
    });

    expect(result.aggregatedCritiques[0].priority).toBe(1);
    expect(result.aggregatedCritiques[1].priority).toBe(2);
  });

  it("does NOT auto-create variant Projects in multi-agent mode", async () => {
    await critiqueArtifact({ artifactId: "art-1", agents: ["Claude", "Grok"] });

    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  it("returns empty variantIds array in multi-agent mode", async () => {
    const result = await critiqueArtifact({
      artifactId: "art-1",
      agents: ["Claude", "Grok"],
    });

    expect(result.variantIds).toHaveLength(0);
  });

  it("logs ARTIFACT_CRITIQUE_CREATED governance event per agent", async () => {
    await critiqueArtifact({ artifactId: "art-1", agents: ["Claude", "Grok"] });

    // One event per agent = 2 total
    const critiqueCalls = vi
      .mocked(prisma.governanceEvent.create)
      .mock.calls.filter(
        ([args]) =>
          (args as { data: { type: string } }).data.type === "ARTIFACT_CRITIQUE_CREATED"
      );
    expect(critiqueCalls).toHaveLength(2);
  });

  it("uses Grok stub suggestions even when ANTHROPIC_API_KEY is absent", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const result = await critiqueArtifact({
      artifactId: "art-1",
      agents: ["Grok"],
    });

    expect(result.aggregatedCritiques[0].agentName).toBe("Grok");
    expect(result.aggregatedCritiques[0].suggestions.length).toBeGreaterThan(0);
    expect(generateObject).not.toHaveBeenCalled();
  });
});

// ── Ranking & scoring heuristics ───────────────────────────────────────────────

const { AGENT_REPUTATION } = await import("../critique-artifact");

describe("critiqueArtifact (ranking heuristics)", () => {
  it("attaches finalScore to each AggregatedCritique", async () => {
    const result = await critiqueArtifact({
      artifactId: "art-1",
      agents: ["Claude", "Grok"],
    });

    for (const c of result.aggregatedCritiques) {
      expect(typeof c.finalScore).toBe("number");
      expect(c.finalScore).toBeGreaterThan(0);
    }
  });

  it("Claude finalScore equals reputation / priority (0.9 / 1 = 0.9)", async () => {
    const result = await critiqueArtifact({
      artifactId: "art-1",
      agents: ["Claude", "Grok"],
    });

    const claude = result.aggregatedCritiques.find((c) => c.agentName === "Claude")!;
    expect(claude.finalScore).toBeCloseTo(0.9, 4);
  });

  it("Grok finalScore equals reputation / priority (0.85 / 2 = 0.425)", async () => {
    const result = await critiqueArtifact({
      artifactId: "art-1",
      agents: ["Claude", "Grok"],
    });

    const grok = result.aggregatedCritiques.find((c) => c.agentName === "Grok")!;
    expect(grok.finalScore).toBeCloseTo(0.425, 4);
  });

  it("aggregatedCritiques are sorted by finalScore descending (Claude before Grok)", async () => {
    const result = await critiqueArtifact({
      artifactId: "art-1",
      agents: ["Claude", "Grok"],
    });

    const scores = result.aggregatedCritiques.map((c) => c.finalScore);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
    }
    expect(result.aggregatedCritiques[0].agentName).toBe("Claude");
  });

  it("Claude scores higher than Grok at equal priority (reputation comparison)", () => {
    const claudeScore = AGENT_REPUTATION["Claude"] / 1;
    const grokScore = AGENT_REPUTATION["Grok"] / 1;
    expect(claudeScore).toBeGreaterThan(grokScore);
  });

  it("governance event includes agentCount and topSuggestion", async () => {
    await critiqueArtifact({ artifactId: "art-1", agents: ["Claude", "Grok"] });

    const critiqueCalls = vi
      .mocked(prisma.governanceEvent.create)
      .mock.calls.filter(
        ([args]) =>
          (args as { data: { type: string } }).data.type === "ARTIFACT_CRITIQUE_CREATED"
      );

    for (const [args] of critiqueCalls) {
      const details = (args as { data: { details: Record<string, unknown> } }).data.details;
      expect(details).toHaveProperty("agentCount", 2);
      expect(typeof details.topSuggestion).toBe("string");
      expect((details.topSuggestion as string).length).toBeLessThanOrEqual(80);
    }
  });

  it("topSuggestion in governance event is a non-empty excerpt from agent suggestions", async () => {
    await critiqueArtifact({ artifactId: "art-1", agents: ["Claude"] });

    const [args] = vi
      .mocked(prisma.governanceEvent.create)
      .mock.calls.find(
        ([a]) => (a as { data: { type: string } }).data.type === "ARTIFACT_CRITIQUE_CREATED"
      )!;

    const details = (args as { data: { details: Record<string, unknown> } }).data.details;
    expect((details.topSuggestion as string).length).toBeGreaterThan(0);
  });
});

// ── Phase 21 — Specialist routing ─────────────────────────────────────────────

describe("critiqueArtifact — specialist routing", () => {
  it("calls routeCritiqueToSpecialist in multi-agent mode", async () => {
    await critiqueArtifact({ artifactId: "art-1", agents: ["Claude", "Grok"] });

    expect(routeCritiqueToSpecialist).toHaveBeenCalledWith({ artifactId: "art-1" });
  });

  it("reorders agents so the specialist appears first when fromSpecialization=true", async () => {
    vi.mocked(routeCritiqueToSpecialist).mockResolvedValueOnce({
      recommendedAgent: "Grok",
      category: "ux",
      score: 0.9,
      fromSpecialization: true,
    });

    await critiqueArtifact({ artifactId: "art-1", agents: ["Claude", "Grok"] });

    // Grok should have been the first agent run (priority=1 in the invocation loop)
    const invocations = vi.mocked(prisma.agentInvocation.create).mock.calls;
    expect((invocations[0][0] as { data: { agentName: string } }).data.agentName).toBe("Grok");
  });

  it("does NOT reorder agents when fromSpecialization=false", async () => {
    vi.mocked(routeCritiqueToSpecialist).mockResolvedValueOnce({
      recommendedAgent: "Grok",
      category: "ux",
      score: 0.9,
      fromSpecialization: false, // reputation fallback — don't override user order
    });

    await critiqueArtifact({ artifactId: "art-1", agents: ["Claude", "Grok"] });

    const invocations = vi.mocked(prisma.agentInvocation.create).mock.calls;
    expect((invocations[0][0] as { data: { agentName: string } }).data.agentName).toBe("Claude");
  });

  it("proceeds normally when routeCritiqueToSpecialist rejects (fail-open)", async () => {
    vi.mocked(routeCritiqueToSpecialist).mockRejectedValueOnce(new Error("DB unavailable"));

    await expect(
      critiqueArtifact({ artifactId: "art-1", agents: ["Claude"] })
    ).resolves.toBeDefined();
  });
});
