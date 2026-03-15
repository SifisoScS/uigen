import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workflowRun: {
      findUnique: vi.fn(),
    },
    artifactRelation: {
      findMany: vi.fn(),
    },
    publicArtifact: {
      findMany: vi.fn(),
    },
    governanceEvent: {
      findMany: vi.fn(),
    },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { prisma } = await import("@/lib/prisma");
const { getWorkflowRunDetail } = await import("../get-workflow-run-detail");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const WF_RUN = {
  id: "wf-1",
  name: "Generate AuthForm",
  description: "Creates auth form components",
  outputSummary: "AuthForm with dark mode",
  inputData: { prompt: "auth form", model: "claude-sonnet" },
  createdAt: new Date("2026-01-01"),
};

const ARTIFACT = {
  id: "art-1",
  name: "AuthForm",
  version: "1.0.0",
  projectId: "proj-1",
  branchName: "release/v1.0.0",
  manifest: { governancePolicy: { policyType: "HUMAN_ONLY" } },
  createdAt: new Date("2026-01-01"),
};

const RELATION = {
  id: "rel-1",
  parentType: "WorkflowRun",
  parentId: "wf-1",
  childType: "PublicArtifact",
  childId: "art-1",
  relationType: "GENERATED_BY",
  createdAt: new Date("2026-01-01"),
};

const GOV_EVENT = {
  id: "evt-1",
  projectId: "proj-1",
  type: "ARTIFACT_RELATION_CREATED",
  actor: "user-1",
  details: { parentType: "WorkflowRun", parentId: "wf-1", childId: "art-1", relationType: "GENERATED_BY" },
  timestamp: new Date("2026-01-01"),
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.artifactRelation.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.governanceEvent.findMany).mockResolvedValue([] as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getWorkflowRunDetail", () => {
  it("returns null when WorkflowRun does not exist", async () => {
    vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(null);

    const result = await getWorkflowRunDetail("nonexistent");

    expect(result).toBeNull();
  });

  it("returns run data with empty artifacts when no relations exist", async () => {
    vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(WF_RUN as never);
    vi.mocked(prisma.artifactRelation.findMany).mockResolvedValue([] as never);

    const result = await getWorkflowRunDetail("wf-1");

    expect(result).not.toBeNull();
    expect(result!.run.id).toBe("wf-1");
    expect(result!.run.name).toBe("Generate AuthForm");
    expect(result!.artifacts).toHaveLength(0);
    expect(result!.govEvents).toHaveLength(0);
  });

  it("returns related artifacts with correct /share links data", async () => {
    vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(WF_RUN as never);
    vi.mocked(prisma.artifactRelation.findMany).mockResolvedValue([RELATION] as never);
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([ARTIFACT] as never);
    vi.mocked(prisma.governanceEvent.findMany).mockResolvedValue([] as never);

    const result = await getWorkflowRunDetail("wf-1");

    expect(result!.artifacts).toHaveLength(1);
    expect(result!.artifacts[0].id).toBe("art-1");
    expect(result!.artifacts[0].name).toBe("AuthForm");
    expect(result!.artifacts[0].relationType).toBe("GENERATED_BY");
    // Caller uses artifact.id to build /share/[id] href
    expect(result!.artifacts[0].id).toBe("art-1");
  });

  it("filters governance events to only those matching the workflowRunId", async () => {
    const otherEvent = {
      ...GOV_EVENT,
      id: "evt-other",
      details: { parentType: "WorkflowRun", parentId: "wf-DIFFERENT", childId: "art-99", relationType: "GENERATED_BY" },
    };

    vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(WF_RUN as never);
    vi.mocked(prisma.artifactRelation.findMany).mockResolvedValue([RELATION] as never);
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([ARTIFACT] as never);
    // Returns two events; only one matches parentId=wf-1
    vi.mocked(prisma.governanceEvent.findMany).mockResolvedValue([GOV_EVENT, otherEvent] as never);

    const result = await getWorkflowRunDetail("wf-1");

    expect(result!.govEvents).toHaveLength(1);
    expect(result!.govEvents[0].id).toBe("evt-1");
  });

  it("preserves inputData as a parsed object", async () => {
    vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(WF_RUN as never);

    const result = await getWorkflowRunDetail("wf-1");

    expect(result!.run.inputData).toEqual({ prompt: "auth form", model: "claude-sonnet" });
  });
});
