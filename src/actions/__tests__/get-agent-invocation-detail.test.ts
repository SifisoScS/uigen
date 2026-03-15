import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentInvocation: { findUnique: vi.fn() },
    artifactRelation: { findMany: vi.fn() },
    publicArtifact: { findMany: vi.fn() },
    governanceEvent: { findMany: vi.fn() },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { prisma } = await import("@/lib/prisma");
const { getAgentInvocationDetail } = await import("../get-agent-invocation-detail");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const INVOCATION = {
  id: "inv-1",
  agentName: "StubAgent",
  prompt: "Critique this UI component",
  critiqueJson: {
    suggestions: ["Add aria-label"],
    issues: ["Missing keyboard navigation"],
  },
  createdAt: new Date("2026-01-01"),
};

const ARTIFACT = {
  id: "art-1",
  name: "AuthForm",
  version: "1.0.0",
  projectId: "proj-1",
  branchName: "release/v1.0",
  manifest: { governancePolicy: { policyType: "HUMAN_ONLY" } },
  createdAt: new Date("2026-01-01"),
};

const RELATION = {
  id: "rel-1",
  parentType: "AgentInvocation",
  parentId: "inv-1",
  childType: "PublicArtifact",
  childId: "art-1",
  relationType: "EVALUATED_BY",
  createdAt: new Date("2026-01-01"),
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.artifactRelation.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.governanceEvent.findMany).mockResolvedValue([] as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getAgentInvocationDetail", () => {
  it("returns null when AgentInvocation does not exist", async () => {
    vi.mocked(prisma.agentInvocation.findUnique).mockResolvedValue(null);

    expect(await getAgentInvocationDetail("nonexistent")).toBeNull();
  });

  it("returns invocation data with empty artifacts when no relations exist", async () => {
    vi.mocked(prisma.agentInvocation.findUnique).mockResolvedValue(INVOCATION as never);

    const result = await getAgentInvocationDetail("inv-1");

    expect(result).not.toBeNull();
    expect(result!.invocation.id).toBe("inv-1");
    expect(result!.invocation.agentName).toBe("StubAgent");
    expect(result!.artifacts).toHaveLength(0);
  });

  it("returns related artifacts with correct relationType", async () => {
    vi.mocked(prisma.agentInvocation.findUnique).mockResolvedValue(INVOCATION as never);
    vi.mocked(prisma.artifactRelation.findMany).mockResolvedValue([RELATION] as never);
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([ARTIFACT] as never);

    const result = await getAgentInvocationDetail("inv-1");

    expect(result!.artifacts).toHaveLength(1);
    expect(result!.artifacts[0].id).toBe("art-1");
    expect(result!.artifacts[0].relationType).toBe("EVALUATED_BY");
  });

  it("preserves critiqueJson as parsed object", async () => {
    vi.mocked(prisma.agentInvocation.findUnique).mockResolvedValue(INVOCATION as never);

    const result = await getAgentInvocationDetail("inv-1");

    expect(result!.invocation.critiqueJson).toEqual({
      suggestions: ["Add aria-label"],
      issues: ["Missing keyboard navigation"],
    });
  });
});
