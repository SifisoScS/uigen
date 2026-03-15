import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    publicArtifact: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    evaluationRun: { findFirst: vi.fn() },
    governanceEvent: { create: vi.fn() },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { aggregateDescendantMetrics } = await import("../aggregate-descendant-metrics");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION = { userId: "user-1", email: "test@example.com", expiresAt: new Date(Date.now() + 3_600_000) };

const ROOT_ARTIFACT = { id: "root", projectId: "proj-1" };

const CHILD = { id: "c1", name: "Button", version: "1.1.0", authorId: null, remixCount: 0, parentArtifactId: "root", createdAt: new Date() };

const GOOD_METRICS = {
  accessibilityScore: 0.9,
  componentCoverage: 0.8,
  styleConsistency: 0.85,
  fileCount: 2,
  linesOfCode: 40,
  overallScore: 0.86,
};

const PASSED_EVAL = {
  artifactId: "c1",
  status: "PASSED",
  metrics: GOOD_METRICS,
  regressionDetected: false,
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(SESSION);
  vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(ROOT_ARTIFACT as never);
  vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.publicArtifact.count).mockResolvedValue(0);
  vi.mocked(prisma.publicArtifact.update).mockResolvedValue({} as never);
  vi.mocked(prisma.evaluationRun.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.governanceEvent.create).mockResolvedValue({ id: "evt-1" } as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("aggregateDescendantMetrics", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(aggregateDescendantMetrics({ artifactId: "root" })).rejects.toThrow(/unauthorized/i);
  });

  it("throws when artifact does not exist", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(null);
    await expect(aggregateDescendantMetrics({ artifactId: "bad" })).rejects.toThrow(/artifact not found/i);
  });

  it("returns zero metrics when artifact has no descendants", async () => {
    const result = await aggregateDescendantMetrics({ artifactId: "root" });

    expect(result.descendantCount).toBe(0);
    expect(result.metrics.successRate).toBe(0);
    expect(result.metrics.evaluatedCount).toBe(0);
  });

  it("updates PublicArtifact.descendantCount and descendantMetrics", async () => {
    vi.mocked(prisma.publicArtifact.findMany).mockImplementation(((args: unknown) => {
      const where = (args as { where: { parentArtifactId: string } }).where;
      if (where.parentArtifactId === "root") return Promise.resolve([CHILD]);
      return Promise.resolve([]);
    }) as never);
    vi.mocked(prisma.evaluationRun.findFirst).mockResolvedValue(PASSED_EVAL as never);

    await aggregateDescendantMetrics({ artifactId: "root" });

    expect(prisma.publicArtifact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "root" },
        data: expect.objectContaining({
          descendantCount: 1,
          descendantMetrics: expect.objectContaining({ descendantCount: 1 }),
        }),
      })
    );
  });

  it("computes successRate correctly when all descendants passed", async () => {
    vi.mocked(prisma.publicArtifact.findMany).mockImplementation(((args: unknown) => {
      const where = (args as { where: { parentArtifactId: string } }).where;
      if (where.parentArtifactId === "root") return Promise.resolve([CHILD]);
      return Promise.resolve([]);
    }) as never);
    vi.mocked(prisma.evaluationRun.findFirst).mockResolvedValue(PASSED_EVAL as never);

    const result = await aggregateDescendantMetrics({ artifactId: "root" });

    expect(result.metrics.evaluatedCount).toBe(1);
    expect(result.metrics.successRate).toBe(1);
    expect(result.metrics.avgOverallScore).toBeCloseTo(0.86, 2);
    expect(result.metrics.avgAccessibilityScore).toBeCloseTo(0.9, 2);
  });

  it("computes successRate=0 when descendant has no evaluation runs", async () => {
    vi.mocked(prisma.publicArtifact.findMany).mockImplementation(((args: unknown) => {
      const where = (args as { where: { parentArtifactId: string } }).where;
      if (where.parentArtifactId === "root") return Promise.resolve([CHILD]);
      return Promise.resolve([]);
    }) as never);
    vi.mocked(prisma.evaluationRun.findFirst).mockResolvedValue(null);

    const result = await aggregateDescendantMetrics({ artifactId: "root" });

    expect(result.metrics.evaluatedCount).toBe(0);
    expect(result.metrics.successRate).toBe(0);
  });

  it("logs DESCENDANT_METRICS_AGGREGATED governance event", async () => {
    vi.mocked(prisma.publicArtifact.findMany).mockImplementation(((args: unknown) => {
      const where = (args as { where: { parentArtifactId: string } }).where;
      if (where.parentArtifactId === "root") return Promise.resolve([CHILD]);
      return Promise.resolve([]);
    }) as never);
    vi.mocked(prisma.evaluationRun.findFirst).mockResolvedValue(PASSED_EVAL as never);

    await aggregateDescendantMetrics({ artifactId: "root" });

    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "DESCENDANT_METRICS_AGGREGATED",
          projectId: "proj-1",
          actor: "system",
          details: expect.objectContaining({
            artifactId: "root",
            descendantCount: 1,
          }),
        }),
      })
    );
  });

  it("computes commonRegressions from descendants with low a11y scores", async () => {
    const poorEval = {
      ...PASSED_EVAL,
      status: "FAILED",
      regressionDetected: true,
      metrics: { ...GOOD_METRICS, accessibilityScore: 0.1, overallScore: 0.3 },
    };

    vi.mocked(prisma.publicArtifact.findMany).mockImplementation(((args: unknown) => {
      const where = (args as { where: { parentArtifactId: string } }).where;
      if (where.parentArtifactId === "root") return Promise.resolve([CHILD]);
      return Promise.resolve([]);
    }) as never);
    vi.mocked(prisma.evaluationRun.findFirst).mockResolvedValue(poorEval as never);

    const result = await aggregateDescendantMetrics({ artifactId: "root" });

    expect(result.metrics.commonRegressions).toContain("accessibilityScore");
  });

  it("returns computedAt as an ISO string", async () => {
    const result = await aggregateDescendantMetrics({ artifactId: "root" });
    expect(() => new Date(result.metrics.computedAt)).not.toThrow();
    expect(result.metrics.computedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
