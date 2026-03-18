import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    publicArtifact: { findUnique: vi.fn() },
    evaluationRun: { findFirst: vi.fn(), create: vi.fn() },
    governanceEvent: { create: vi.fn() },
  },
}));

vi.mock("@/lib/governance/rule-engine", () => ({
  processGovernanceEvent: vi.fn().mockResolvedValue({ eventType: "EVALUATION_RUN_COMPLETED", firedRules: [] }),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { processGovernanceEvent } = await import("@/lib/governance/rule-engine");
const { evaluateArtifact } = await import("../evaluate-artifact");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION = { userId: "user-abc", email: "test@example.com", expiresAt: new Date(Date.now() + 3_600_000) };

// A11y-rich one-file artifact
const FILES_DATA = JSON.stringify({
  type: "directory", name: "/", path: "/",
  children: {
    "App.tsx": {
      type: "file", name: "App.tsx", path: "/App.tsx",
      content: `
import { Button } from "@/components/ui/button";
export default function App() {
  return (
    <div className="flex gap-4 bg-blue-500">
      <Button aria-label="Submit" onClick={() => {}}>Submit</Button>
      <input aria-required="true" role="textbox" className="text-white" />
    </div>
  );
}`,
    },
  },
});

const ARTIFACT = {
  id: "art-1",
  projectId: "proj-1",
  filesData: FILES_DATA,
  parentArtifactId: null,
};

const EVAL_RUN = {
  id: "eval-1",
  artifactId: "art-1",
  status: "PASSED",
  metrics: {},
  regressionDetected: false,
  baselineArtifactId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(SESSION);
  vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(ARTIFACT as never);
  vi.mocked(prisma.evaluationRun.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.evaluationRun.create).mockResolvedValue(EVAL_RUN as never);
  vi.mocked(prisma.governanceEvent.create).mockResolvedValue({ id: "evt-1" } as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("evaluateArtifact", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(evaluateArtifact({ artifactId: "art-1" })).rejects.toThrow(/unauthorized/i);
  });

  it("throws when artifact is not found", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(null);
    await expect(evaluateArtifact({ artifactId: "bad-id" })).rejects.toThrow(/artifact not found/i);
  });

  it("returns PASSED status for a well-formed artifact", async () => {
    const result = await evaluateArtifact({ artifactId: "art-1" });
    expect(result.status).toBe("PASSED");
    expect(result.metrics.overallScore).toBeGreaterThan(0);
  });

  it("returns FAILED when overallScore is below threshold", async () => {
    // Interactive elements with zero a11y attributes + no registry components
    // → accessibilityScore=0, componentCoverage=0, overallScore≈0.25 < PASS_THRESHOLD
    const poorFilesData = JSON.stringify({
      type: "directory", name: "/", path: "/",
      children: {
        "App.tsx": {
          type: "file", name: "App.tsx", path: "/App.tsx",
          content: `export default function App() {
  return (
    <div>
      <button onClick={() => {}}>Click</button>
      <input type="text" />
      <select><option>A</option></select>
    </div>
  );
}`,
        },
      },
    });
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue({
      ...ARTIFACT,
      filesData: poorFilesData,
    } as never);

    const result = await evaluateArtifact({ artifactId: "art-1" });
    expect(result.status).toBe("FAILED");
  });

  it("logs EVALUATION_RUN_COMPLETED governance event", async () => {
    await evaluateArtifact({ artifactId: "art-1" });

    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "EVALUATION_RUN_COMPLETED",
          projectId: "proj-1",
          actor: "system",
          details: expect.objectContaining({
            artifactId: "art-1",
            status: expect.stringMatching(/PASSED|FAILED/),
            overallScore: expect.any(Number),
          }),
        }),
      })
    );
  });

  it("detects regression and logs REGRESSION_DETECTED when baseline metrics dropped", async () => {
    // Baseline has high scores
    const highMetrics = {
      accessibilityScore: 0.95,
      componentCoverage: 0.9,
      styleConsistency: 0.9,
      fileCount: 2,
      linesOfCode: 50,
      overallScore: 0.92,
    };
    vi.mocked(prisma.evaluationRun.findFirst).mockResolvedValue({
      id: "baseline-eval",
      status: "PASSED",
      metrics: highMetrics,
    } as never);

    // Artifact with low a11y (will drop significantly vs baseline)
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue({
      ...ARTIFACT,
      parentArtifactId: "art-0",
    } as never);

    const result = await evaluateArtifact({ artifactId: "art-1", baselineArtifactId: "art-0" });

    expect(result.regressionDetected).toBe(true);
    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "REGRESSION_DETECTED" }),
      })
    );
  });

  it("does NOT log REGRESSION_DETECTED when no baseline exists", async () => {
    vi.mocked(prisma.evaluationRun.findFirst).mockResolvedValue(null);

    await evaluateArtifact({ artifactId: "art-1" });

    const calls = vi.mocked(prisma.governanceEvent.create).mock.calls;
    const types = calls.map((c) => (c[0] as { data: { type: string } }).data.type);
    expect(types).not.toContain("REGRESSION_DETECTED");
  });

  it("persists EvaluationRun with correct fields", async () => {
    await evaluateArtifact({ artifactId: "art-1" });

    expect(prisma.evaluationRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          artifactId: "art-1",
          status: expect.stringMatching(/PASSED|FAILED/),
          metrics: expect.objectContaining({ overallScore: expect.any(Number) }),
          regressionDetected: false,
        }),
      })
    );
  });

  it("returns evaluationRunId from the created record", async () => {
    const result = await evaluateArtifact({ artifactId: "art-1" });
    expect(result.evaluationRunId).toBe("eval-1");
  });
});

// ── Phase 20 — Rule engine wiring ─────────────────────────────────────────────

describe("evaluateArtifact — rule engine", () => {
  it("calls processGovernanceEvent with EVALUATION_RUN_COMPLETED after emitting event", async () => {
    await evaluateArtifact({ artifactId: "art-1" });

    expect(processGovernanceEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "EVALUATION_RUN_COMPLETED",
        details: expect.objectContaining({ artifactId: "art-1" }),
      })
    );
  });

  it("does not throw when processGovernanceEvent rejects (fire-and-forget)", async () => {
    vi.mocked(processGovernanceEvent).mockRejectedValueOnce(new Error("Rule engine down"));

    await expect(evaluateArtifact({ artifactId: "art-1" })).resolves.toBeDefined();
  });
});
