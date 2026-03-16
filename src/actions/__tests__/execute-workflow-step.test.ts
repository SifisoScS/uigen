import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workflowStep: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    workflowRun: { updateMany: vi.fn(), update: vi.fn() },
    governanceEvent: { create: vi.fn() },
  },
}));

vi.mock("@/actions/evaluate-artifact", () => ({
  evaluateArtifact: vi.fn(),
}));

vi.mock("@/actions/critique-artifact", () => ({
  critiqueArtifact: vi.fn().mockResolvedValue({
    invocationId: "inv-1",
    variantIds: ["var-1"],
    aggregatedCritiques: [{ suggestions: ["Add aria-label"], issues: [] }],
  }),
}));

vi.mock("@/actions/score-critique-suggestions", () => ({
  scoreCritiqueSuggestions: vi.fn().mockResolvedValue({
    scoredSuggestions: [{ text: "Add aria-label", expectedImpactScore: 0.8 }],
    artifactComplexity: 0.4,
  }),
}));

vi.mock("@/actions/generate-selected-variants", () => ({
  generateSelectedVariants: vi.fn().mockResolvedValue({ variantIds: ["var-2", "var-3"] }),
}));

vi.mock("@/actions/coordinate-critiques", () => ({}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { evaluateArtifact } = await import("@/actions/evaluate-artifact");
const { critiqueArtifact } = await import("@/actions/critique-artifact");
const { scoreCritiqueSuggestions } = await import("@/actions/score-critique-suggestions");
const { generateSelectedVariants } = await import("@/actions/generate-selected-variants");
const { executeWorkflowStep } = await import("../execute-workflow-step");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION = { userId: "user-1", email: "test@example.com", expiresAt: new Date(Date.now() + 3_600_000) };

const STEP_EVALUATE = {
  id: "step-1",
  runId: "run-1",
  stepIndex: 0,
  stepType: "EVALUATE",
  status: "PENDING",
  inputData: { artifactId: "art-1" },
  outputData: null,
  durationMs: null,
  errorMessage: null,
};

const EVAL_RESULT = {
  evaluationRunId: "eval-1",
  status: "PASSED",
  metrics: { overallScore: 0.85, accessibilityScore: 0.9, componentCoverage: 0.8, styleConsistency: 0.8, fileCount: 1, linesOfCode: 20 },
  regressionDetected: false,
  regressionReport: null,
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(SESSION);
  vi.mocked(prisma.workflowStep.findUnique).mockResolvedValue(STEP_EVALUATE as never);
  vi.mocked(prisma.workflowStep.update).mockResolvedValue(STEP_EVALUATE as never);
  vi.mocked(prisma.workflowStep.findMany).mockResolvedValue([{ status: "COMPLETED" }] as never);
  vi.mocked(prisma.workflowRun.updateMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(prisma.workflowRun.update).mockResolvedValue({} as never);
  vi.mocked(prisma.governanceEvent.create).mockResolvedValue({ id: "evt-1" } as never);
  vi.mocked(evaluateArtifact).mockResolvedValue(EVAL_RESULT as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("executeWorkflowStep", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(
      executeWorkflowStep({ stepId: "step-1", projectId: "proj-1" })
    ).rejects.toThrow(/unauthorized/i);
  });

  it("throws when step does not exist", async () => {
    vi.mocked(prisma.workflowStep.findUnique).mockResolvedValue(null);
    await expect(
      executeWorkflowStep({ stepId: "bad-id", projectId: "proj-1" })
    ).rejects.toThrow(/not found/i);
  });

  it("throws when step is already COMPLETED", async () => {
    vi.mocked(prisma.workflowStep.findUnique).mockResolvedValue(
      { ...STEP_EVALUATE, status: "COMPLETED" } as never
    );
    await expect(
      executeWorkflowStep({ stepId: "step-1", projectId: "proj-1" })
    ).rejects.toThrow(/already COMPLETED/i);
  });

  it("throws when step is already RUNNING", async () => {
    vi.mocked(prisma.workflowStep.findUnique).mockResolvedValue(
      { ...STEP_EVALUATE, status: "RUNNING" } as never
    );
    await expect(
      executeWorkflowStep({ stepId: "step-1", projectId: "proj-1" })
    ).rejects.toThrow(/already RUNNING/i);
  });

  it("marks step RUNNING then COMPLETED on success", async () => {
    const result = await executeWorkflowStep({ stepId: "step-1", projectId: "proj-1" });
    expect(result.status).toBe("COMPLETED");
    expect(result.stepId).toBe("step-1");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("calls evaluateArtifact for EVALUATE step type", async () => {
    const result = await executeWorkflowStep({ stepId: "step-1", projectId: "proj-1" });
    expect(evaluateArtifact).toHaveBeenCalledWith({ artifactId: "art-1", baselineArtifactId: undefined });
    expect(result.outputData.evaluationRunId).toBe("eval-1");
    expect(result.outputData.status).toBe("PASSED");
  });

  it("logs WORKFLOW_STEP_STARTED governance event", async () => {
    await executeWorkflowStep({ stepId: "step-1", projectId: "proj-1" });
    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "WORKFLOW_STEP_STARTED", projectId: "proj-1" }),
      })
    );
  });

  it("logs WORKFLOW_STEP_COMPLETED governance event on success", async () => {
    await executeWorkflowStep({ stepId: "step-1", projectId: "proj-1" });
    const calls = vi.mocked(prisma.governanceEvent.create).mock.calls;
    const types = calls.map((c) => (c[0] as { data: { type: string } }).data.type);
    expect(types).toContain("WORKFLOW_STEP_COMPLETED");
  });

  it("marks step FAILED and logs WORKFLOW_STEP_FAILED when sub-action throws", async () => {
    vi.mocked(evaluateArtifact).mockRejectedValue(new Error("compute failed"));

    const result = await executeWorkflowStep({ stepId: "step-1", projectId: "proj-1" });
    expect(result.status).toBe("FAILED");
    expect(result.outputData.error).toBe("compute failed");

    const calls = vi.mocked(prisma.governanceEvent.create).mock.calls;
    const types = calls.map((c) => (c[0] as { data: { type: string } }).data.type);
    expect(types).toContain("WORKFLOW_STEP_FAILED");
  });

  it("logs WORKFLOW_RUN_COMPLETED when all steps are done", async () => {
    vi.mocked(prisma.workflowStep.findMany).mockResolvedValue([
      { status: "COMPLETED" },
    ] as never);

    await executeWorkflowStep({ stepId: "step-1", projectId: "proj-1" });

    const calls = vi.mocked(prisma.governanceEvent.create).mock.calls;
    const types = calls.map((c) => (c[0] as { data: { type: string } }).data.type);
    expect(types).toContain("WORKFLOW_RUN_COMPLETED");
  });

  it("does NOT log WORKFLOW_RUN_COMPLETED when other steps still PENDING", async () => {
    vi.mocked(prisma.workflowStep.findMany).mockResolvedValue([
      { status: "COMPLETED" },
      { status: "PENDING" },
    ] as never);

    await executeWorkflowStep({ stepId: "step-1", projectId: "proj-1" });

    const calls = vi.mocked(prisma.governanceEvent.create).mock.calls;
    const types = calls.map((c) => (c[0] as { data: { type: string } }).data.type);
    expect(types).not.toContain("WORKFLOW_RUN_COMPLETED");
  });

  it("EVALUATE step throws when artifactId is missing from inputData", async () => {
    vi.mocked(prisma.workflowStep.findUnique).mockResolvedValue(
      { ...STEP_EVALUATE, inputData: {} } as never
    );

    const result = await executeWorkflowStep({ stepId: "step-1", projectId: "proj-1" });
    expect(result.status).toBe("FAILED");
    expect(result.outputData.error).toMatch(/artifactId/);
  });

  it("CRITIQUE step calls critiqueArtifact and returns invocationId + counts", async () => {
    vi.mocked(prisma.workflowStep.findUnique).mockResolvedValue(
      { ...STEP_EVALUATE, stepType: "CRITIQUE", inputData: { artifactId: "art-1" } } as never
    );

    const result = await executeWorkflowStep({ stepId: "step-1", projectId: "proj-1" });
    expect(result.status).toBe("COMPLETED");
    expect(critiqueArtifact).toHaveBeenCalledWith({ artifactId: "art-1", agentName: undefined, agents: undefined });
    expect(result.outputData.invocationId).toBe("inv-1");
    expect(result.outputData.variantCount).toBe(1);
    expect(result.outputData.aggregatedCritiqueCount).toBe(1);
  });

  it("SCORE step calls scoreCritiqueSuggestions and returns scoredCount + topSuggestion", async () => {
    vi.mocked(prisma.workflowStep.findUnique).mockResolvedValue(
      {
        ...STEP_EVALUATE,
        stepType: "SCORE",
        inputData: { artifactId: "art-1", suggestions: [{ text: "Add aria-label", agentName: "agent-a", weight: 1 }] },
      } as never
    );

    const result = await executeWorkflowStep({ stepId: "step-1", projectId: "proj-1" });
    expect(result.status).toBe("COMPLETED");
    expect(scoreCritiqueSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({ artifactId: "art-1" })
    );
    expect(result.outputData.scoredCount).toBe(1);
    expect(result.outputData.topSuggestion).toBe("Add aria-label");
    expect(result.outputData.autoSelectCount).toBe(1);
  });

  it("GENERATE_VARIANTS step calls generateSelectedVariants and returns variantIds", async () => {
    vi.mocked(prisma.workflowStep.findUnique).mockResolvedValue(
      {
        ...STEP_EVALUATE,
        stepType: "GENERATE_VARIANTS",
        inputData: { artifactId: "art-1", suggestions: [{ text: "Add aria-label", agentName: "agent-a" }] },
      } as never
    );

    const result = await executeWorkflowStep({ stepId: "step-1", projectId: "proj-1" });
    expect(result.status).toBe("COMPLETED");
    expect(generateSelectedVariants).toHaveBeenCalledWith(
      expect.objectContaining({ artifactId: "art-1" })
    );
    expect(result.outputData.variantIds).toEqual(["var-2", "var-3"]);
    expect(result.outputData.variantCount).toBe(2);
  });
});
