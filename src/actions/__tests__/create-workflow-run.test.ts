import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workflowRun: { create: vi.fn() },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { createWorkflowRun } = await import("../create-workflow-run");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION = { userId: "user-1", email: "test@example.com", expiresAt: new Date(Date.now() + 3_600_000) };

const CREATED_RUN = {
  id: "wf-1",
  name: "Evaluate AuthForm",
  description: null,
  outputSummary: null,
  status: "PENDING",
  createdAt: new Date(),
  _count: { steps: 0 },
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(SESSION);
  vi.mocked(prisma.workflowRun.create).mockResolvedValue(CREATED_RUN as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("createWorkflowRun", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(createWorkflowRun({ name: "Test" })).rejects.toThrow(/unauthorized/i);
  });

  it("throws when name is empty", async () => {
    await expect(createWorkflowRun({ name: "   " })).rejects.toThrow(/name cannot be empty/i);
  });

  it("creates a WorkflowRun with PENDING status", async () => {
    const result = await createWorkflowRun({ name: "Evaluate AuthForm" });
    expect(result.id).toBe("wf-1");
    expect(result.status).toBe("PENDING");
    expect(result.stepCount).toBe(0);
  });

  it("passes status PENDING to prisma.create", async () => {
    await createWorkflowRun({ name: "My Run" });
    expect(prisma.workflowRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PENDING" }),
      })
    );
  });

  it("creates WorkflowStep records when steps array is provided", async () => {
    vi.mocked(prisma.workflowRun.create).mockResolvedValue({
      ...CREATED_RUN,
      _count: { steps: 2 },
    } as never);

    const result = await createWorkflowRun({
      name: "Full Pipeline",
      steps: [
        { stepIndex: 0, stepType: "EVALUATE", inputData: { artifactId: "art-1" } },
        { stepIndex: 1, stepType: "CRITIQUE", inputData: { artifactId: "art-1" } },
      ],
    });

    expect(result.stepCount).toBe(2);
    expect(prisma.workflowRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          steps: {
            create: [
              expect.objectContaining({ stepIndex: 0, stepType: "EVALUATE" }),
              expect.objectContaining({ stepIndex: 1, stepType: "CRITIQUE" }),
            ],
          },
        }),
      })
    );
  });

  it("trims whitespace from name", async () => {
    await createWorkflowRun({ name: "  My Run  " });
    expect(prisma.workflowRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "My Run" }),
      })
    );
  });
});
