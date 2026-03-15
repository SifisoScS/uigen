import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workflowStep: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { prisma } = await import("@/lib/prisma");
const { getWorkflowStepDetail, getWorkflowStepsByRun } = await import("../get-workflow-step-detail");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STEP = {
  id: "step-1",
  runId: "run-1",
  stepIndex: 0,
  stepType: "EVALUATE",
  status: "COMPLETED",
  inputData: { artifactId: "art-1" },
  outputData: { evaluationRunId: "eval-1", status: "PASSED", overallScore: 0.85 },
  durationMs: 240,
  errorMessage: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getWorkflowStepDetail", () => {
  it("returns null when step does not exist", async () => {
    vi.mocked(prisma.workflowStep.findUnique).mockResolvedValue(null);
    const result = await getWorkflowStepDetail("nonexistent");
    expect(result).toBeNull();
  });

  it("returns step detail with typed inputData and outputData", async () => {
    vi.mocked(prisma.workflowStep.findUnique).mockResolvedValue(STEP as never);

    const result = await getWorkflowStepDetail("step-1");

    expect(result).not.toBeNull();
    expect(result!.id).toBe("step-1");
    expect(result!.stepType).toBe("EVALUATE");
    expect(result!.status).toBe("COMPLETED");
    expect(result!.durationMs).toBe(240);
    expect(result!.inputData).toEqual({ artifactId: "art-1" });
    expect(result!.outputData).toEqual({ evaluationRunId: "eval-1", status: "PASSED", overallScore: 0.85 });
  });

  it("returns null inputData and outputData when both are null", async () => {
    vi.mocked(prisma.workflowStep.findUnique).mockResolvedValue(
      { ...STEP, inputData: null, outputData: null } as never
    );

    const result = await getWorkflowStepDetail("step-1");
    expect(result!.inputData).toBeNull();
    expect(result!.outputData).toBeNull();
  });
});

describe("getWorkflowStepsByRun", () => {
  it("returns empty array when no steps exist for run", async () => {
    vi.mocked(prisma.workflowStep.findMany).mockResolvedValue([] as never);

    const result = await getWorkflowStepsByRun("run-1");

    expect(result).toHaveLength(0);
    expect(prisma.workflowStep.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { runId: "run-1" } })
    );
  });

  it("returns steps ordered by stepIndex", async () => {
    const steps = [
      { ...STEP, id: "step-1", stepIndex: 0, stepType: "EVALUATE" },
      { ...STEP, id: "step-2", stepIndex: 1, stepType: "CRITIQUE" },
      { ...STEP, id: "step-3", stepIndex: 2, stepType: "SCORE" },
    ];
    vi.mocked(prisma.workflowStep.findMany).mockResolvedValue(steps as never);

    const result = await getWorkflowStepsByRun("run-1");

    expect(result).toHaveLength(3);
    expect(result[0].stepType).toBe("EVALUATE");
    expect(result[1].stepType).toBe("CRITIQUE");
    expect(result[2].stepType).toBe("SCORE");
  });

  it("queries by runId with ascending stepIndex order", async () => {
    vi.mocked(prisma.workflowStep.findMany).mockResolvedValue([] as never);

    await getWorkflowStepsByRun("run-42");

    expect(prisma.workflowStep.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { runId: "run-42" },
        orderBy: { stepIndex: "asc" },
      })
    );
  });
});
