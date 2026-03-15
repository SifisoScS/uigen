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
  },
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => "mock-anthropic-model"),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { generateObject } = await import("ai");
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
