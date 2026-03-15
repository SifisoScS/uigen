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

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
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
};

const INVOCATION = {
  id: "inv-1",
  agentName: "StubAgent",
  prompt: "Critique this UI component",
  critiqueJson: { suggestions: ["Add aria-label"], issues: ["Missing keyboard nav"] },
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(SESSION);
  vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(ARTIFACT as never);
  vi.mocked(prisma.agentInvocation.create).mockResolvedValue(INVOCATION as never);
  vi.mocked(prisma.artifactRelation.create).mockResolvedValue({ id: "rel-1" } as never);
  vi.mocked(prisma.governanceEvent.create).mockResolvedValue({ id: "evt-1" } as never);
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

    expect(result).toEqual({ invocationId: "inv-1" });
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
});
