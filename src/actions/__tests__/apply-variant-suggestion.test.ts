import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    artifactRelation: { findFirst: vi.fn() },
    project: { findUnique: vi.fn(), update: vi.fn() },
    publicArtifact: { findUnique: vi.fn() },
    governanceEvent: { create: vi.fn() },
  },
}));

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => "mock-model"),
}));

vi.mock("@/lib/provider", () => ({
  getLanguageModel: vi.fn(() => "mock-model"),
}));

vi.mock("@/lib/file-system", () => {
  const VirtualFileSystem = vi.fn().mockImplementation(() => ({
    deserializeFromNodes: vi.fn(),
    serialize: vi.fn().mockReturnValue({}),
  }));
  return { VirtualFileSystem };
});

vi.mock("@/lib/tools/str-replace", () => ({
  buildStrReplaceTool: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/tools/file-manager", () => ({
  buildFileManagerTool: vi.fn().mockReturnValue({}),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { generateText } = await import("ai");
const { applyVariantSuggestion } = await import("../apply-variant-suggestion");

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
  createdAt: new Date(),
};

const PROJECT = {
  id: "proj-var-1",
  name: "AuthForm \u2014 Add aria-label to interactive elements",
  userId: null,
  public: false,
  messages: "[]",
  data: "{}",
  forkedFromSnapshotId: null,
  remixedFromArtifactId: null,
  status: "DRAFT",
  approvedAt: null,
  approvedBy: null,
  mergedFromVariantId: null,
  mergedAt: null,
  conflictResolvedAt: null,
  mutationAppliedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const ARTIFACT = {
  name: "AuthForm",
  projectId: "proj-1",
  semanticSummary: "A login form with email and password fields",
  componentTree: null,
};

const GENERATE_TEXT_RESULT = {
  steps: [
    {
      toolCalls: [
        { toolName: "str_replace_editor", args: { command: "view", path: "/App.jsx" } },
        { toolName: "str_replace_editor", args: { command: "str_replace", path: "/App.jsx", old_str: "foo", new_str: "bar" } },
      ],
    },
    {
      toolCalls: [
        { toolName: "str_replace_editor", args: { command: "str_replace", path: "/components/Button.jsx" } },
      ],
    },
  ],
  text: "",
  toolCalls: [],
  toolResults: [],
  finishReason: "stop",
  usage: { promptTokens: 100, completionTokens: 200 },
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(SESSION);
  vi.mocked(prisma.artifactRelation.findFirst).mockResolvedValue(RELATION as never);
  vi.mocked(prisma.project.findUnique).mockResolvedValue(PROJECT as never);
  vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(ARTIFACT as never);
  vi.mocked(generateText).mockResolvedValue(GENERATE_TEXT_RESULT as never);
  vi.mocked(prisma.project.update).mockResolvedValue({ ...PROJECT, mutationAppliedAt: new Date() } as never);
  vi.mocked(prisma.governanceEvent.create).mockResolvedValue({ id: "evt-1" } as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("applyVariantSuggestion", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await expect(
      applyVariantSuggestion({ variantProjectId: "proj-var-1" })
    ).rejects.toThrow(/unauthorized/i);

    expect(generateText).not.toHaveBeenCalled();
  });

  it("throws when not a variant project", async () => {
    vi.mocked(prisma.artifactRelation.findFirst).mockResolvedValue(null);

    await expect(
      applyVariantSuggestion({ variantProjectId: "proj-var-1" })
    ).rejects.toThrow(/not a variant/i);

    expect(generateText).not.toHaveBeenCalled();
  });

  it("returns idempotent result when mutationAppliedAt is already set", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue({
      ...PROJECT,
      mutationAppliedAt: new Date(),
    } as never);

    const result = await applyVariantSuggestion({ variantProjectId: "proj-var-1" });

    expect(result).toEqual({ stepsUsed: 0, mutatedPaths: [] });
    expect(generateText).not.toHaveBeenCalled();
  });

  it("throws when project name has no suggestion separator", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue({
      ...PROJECT,
      name: "AuthForm",
    } as never);

    await expect(
      applyVariantSuggestion({ variantProjectId: "proj-var-1" })
    ).rejects.toThrow(/no suggestion/i);

    expect(generateText).not.toHaveBeenCalled();
  });

  it("calls generateText with suggestion text in the prompt", async () => {
    await applyVariantSuggestion({ variantProjectId: "proj-var-1" });

    expect(generateText).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(generateText).mock.calls[0][0];
    expect(callArgs.prompt).toContain("Add aria-label to interactive elements");
  });

  it("persists updated data and sets mutationAppliedAt", async () => {
    await applyVariantSuggestion({ variantProjectId: "proj-var-1" });

    expect(prisma.project.update).toHaveBeenCalledOnce();
    const updateCall = vi.mocked(prisma.project.update).mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: "proj-var-1" });
    expect(updateCall.data.mutationAppliedAt).toBeInstanceOf(Date);
    expect(typeof updateCall.data.data).toBe("string");
  });

  it("logs ARTIFACT_VARIANT_MUTATED governance event with correct fields", async () => {
    await applyVariantSuggestion({ variantProjectId: "proj-var-1" });

    expect(prisma.governanceEvent.create).toHaveBeenCalledOnce();
    const evtCall = vi.mocked(prisma.governanceEvent.create).mock.calls[0][0];
    expect(evtCall.data.type).toBe("ARTIFACT_VARIANT_MUTATED");
    expect(evtCall.data.actor).toBe("claude");
    const details = evtCall.data.details as Record<string, unknown>;
    expect(details.variantProjectId).toBe("proj-var-1");
    expect(details.suggestion).toBe("Add aria-label to interactive elements");
  });

  it("extracts deduplicated mutatedPaths from result.steps tool calls", async () => {
    const result = await applyVariantSuggestion({ variantProjectId: "proj-var-1" });

    // GENERATE_TEXT_RESULT has /App.jsx appearing twice across steps, /components/Button.jsx once
    expect(result.mutatedPaths).toHaveLength(2);
    expect(result.mutatedPaths).toContain("/App.jsx");
    expect(result.mutatedPaths).toContain("/components/Button.jsx");
    expect(result.stepsUsed).toBe(2);
  });
});
