import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    branchPolicy: { findMany: vi.fn(), update: vi.fn() },
    agentReputation: { updateMany: vi.fn() },
    governanceRule: { findMany: vi.fn() },
    governanceEvent: { create: vi.fn() },
  },
}));

vi.mock("@/actions/aggregate-descendant-metrics", () => ({
  aggregateDescendantMetrics: vi.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { prisma } = await import("@/lib/prisma");
const { aggregateDescendantMetrics } = await import("@/actions/aggregate-descendant-metrics");
const { processGovernanceEvent, evaluateCondition } = await import("../rule-engine");

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.governanceRule.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.branchPolicy.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.branchPolicy.update).mockResolvedValue({} as never);
  vi.mocked(prisma.agentReputation.updateMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(prisma.governanceEvent.create).mockResolvedValue({ id: "evt-x" } as never);
  vi.mocked(aggregateDescendantMetrics).mockResolvedValue({
    artifactId: "art-1", descendantCount: 1, metrics: {} as never,
  });
});

// ── evaluateCondition ─────────────────────────────────────────────────────────

describe("evaluateCondition", () => {
  it('operator "eq" matches equal values', () => {
    expect(evaluateCondition({ field: "status", operator: "eq", value: "FAILED" }, { status: "FAILED" })).toBe(true);
    expect(evaluateCondition({ field: "status", operator: "eq", value: "FAILED" }, { status: "PASSED" })).toBe(false);
  });

  it('operator "lt" compares numbers', () => {
    expect(evaluateCondition({ field: "newScore", operator: "lt", value: 0.4 }, { newScore: 0.3 })).toBe(true);
    expect(evaluateCondition({ field: "newScore", operator: "lt", value: 0.4 }, { newScore: 0.5 })).toBe(false);
  });

  it('operator "gt" compares numbers', () => {
    expect(evaluateCondition({ field: "count", operator: "gt", value: 5 }, { count: 10 })).toBe(true);
    expect(evaluateCondition({ field: "count", operator: "gt", value: 5 }, { count: 3 })).toBe(false);
  });

  it('operator "contains" checks substring', () => {
    expect(evaluateCondition({ field: "name", operator: "contains", value: "Auth" }, { name: "AuthForm" })).toBe(true);
    expect(evaluateCondition({ field: "name", operator: "contains", value: "Auth" }, { name: "Button" })).toBe(false);
  });

  it("resolves dot-notation nested fields", () => {
    expect(evaluateCondition(
      { field: "meta.score", operator: "lt", value: 0.5 },
      { meta: { score: 0.2 } }
    )).toBe(true);
  });

  it("returns false when field is missing", () => {
    expect(evaluateCondition({ field: "missing", operator: "eq", value: "x" }, {})).toBe(false);
  });
});

// ── processGovernanceEvent — built-in rules ───────────────────────────────────

describe("processGovernanceEvent — built-in rules", () => {
  it("fires LOCK_BRANCH when EVALUATION_RUN_COMPLETED with status=FAILED", async () => {
    vi.mocked(prisma.branchPolicy.findMany).mockResolvedValue([
      { id: "bp-1", branchName: "release/v1.0", policyType: "HUMAN_ONLY" },
    ] as never);

    const result = await processGovernanceEvent({
      type: "EVALUATION_RUN_COMPLETED",
      projectId: "proj-1",
      details: { status: "FAILED", artifactId: "art-1" },
    });

    const fired = result.firedRules.find((r) => r.actionType === "LOCK_BRANCH");
    expect(fired).toBeDefined();
    expect(fired!.builtIn).toBe(true);
    expect(prisma.branchPolicy.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { policyType: "LOCKED" } })
    );
  });

  it("does NOT fire LOCK_BRANCH when EVALUATION_RUN_COMPLETED with status=PASSED", async () => {
    const result = await processGovernanceEvent({
      type: "EVALUATION_RUN_COMPLETED",
      projectId: "proj-1",
      details: { status: "PASSED", artifactId: "art-1" },
    });

    const fired = result.firedRules.find((r) => r.actionType === "LOCK_BRANCH");
    expect(fired).toBeUndefined();
    expect(prisma.branchPolicy.update).not.toHaveBeenCalled();
  });

  it("fires DEMOTE_AGENT when AGENT_REPUTATION_UPDATED with newScore < 0.4", async () => {
    const result = await processGovernanceEvent({
      type: "AGENT_REPUTATION_UPDATED",
      projectId: "proj-1",
      details: { agentName: "Grok", newScore: 0.25 },
    });

    const fired = result.firedRules.find((r) => r.actionType === "DEMOTE_AGENT");
    expect(fired).toBeDefined();
    expect(prisma.agentReputation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { agentName: "Grok" }, data: { score: 0.3 } })
    );
    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "AGENT_DEMOTED" }) })
    );
  });

  it("does NOT fire DEMOTE_AGENT when newScore >= 0.4", async () => {
    const result = await processGovernanceEvent({
      type: "AGENT_REPUTATION_UPDATED",
      projectId: "proj-1",
      details: { agentName: "Claude", newScore: 0.9 },
    });

    expect(result.firedRules.find((r) => r.actionType === "DEMOTE_AGENT")).toBeUndefined();
    expect(prisma.agentReputation.updateMany).not.toHaveBeenCalled();
  });

  it("fires TRIGGER_AGGREGATION on ARTIFACT_VARIANT_PUBLISHED unconditionally", async () => {
    const result = await processGovernanceEvent({
      type: "ARTIFACT_VARIANT_PUBLISHED",
      projectId: "proj-1",
      details: { parentArtifactId: "art-1", version: "1.1.0" },
    });

    const fired = result.firedRules.find((r) => r.actionType === "TRIGGER_AGGREGATION");
    expect(fired).toBeDefined();
    expect(aggregateDescendantMetrics).toHaveBeenCalledWith({ artifactId: "art-1" });
  });

  it("skips LOCK_BRANCH when branch is already LOCKED", async () => {
    vi.mocked(prisma.branchPolicy.findMany).mockResolvedValue([
      { id: "bp-1", branchName: "release/v1.0", policyType: "LOCKED" },
    ] as never);

    await processGovernanceEvent({
      type: "EVALUATION_RUN_COMPLETED",
      projectId: "proj-1",
      details: { status: "FAILED" },
    });

    expect(prisma.branchPolicy.update).not.toHaveBeenCalled();
  });

  it("returns empty firedRules for unrelated event types", async () => {
    const result = await processGovernanceEvent({
      type: "BRANCH_POLICY_SET",
      projectId: "proj-1",
      details: {},
    });

    expect(result.firedRules).toHaveLength(0);
  });
});

// ── processGovernanceEvent — DB rules ─────────────────────────────────────────

describe("processGovernanceEvent — DB rules", () => {
  it("evaluates and fires a DB rule when condition passes", async () => {
    vi.mocked(prisma.governanceRule.findMany).mockResolvedValue([
      {
        id: "db-rule-1",
        name: "Custom log rule",
        eventType: "ARTIFACT_PUBLISHED",
        condition: { field: "version", operator: "contains", value: "1.0" },
        action: { type: "LOG_EVENT", params: { eventType: "CUSTOM_PUBLISHED" } },
        enabled: true,
      },
    ] as never);

    const result = await processGovernanceEvent({
      type: "ARTIFACT_PUBLISHED",
      projectId: "proj-1",
      details: { version: "1.0.0" },
    });

    const fired = result.firedRules.find((r) => r.ruleId === "db-rule-1");
    expect(fired).toBeDefined();
    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "CUSTOM_PUBLISHED" }),
      })
    );
  });

  it("skips DB rule when condition does not pass", async () => {
    vi.mocked(prisma.governanceRule.findMany).mockResolvedValue([
      {
        id: "db-rule-2",
        name: "Strict version check",
        eventType: "ARTIFACT_PUBLISHED",
        condition: { field: "version", operator: "eq", value: "2.0.0" },
        action: { type: "LOG_EVENT", params: { eventType: "MAJOR_RELEASED" } },
        enabled: true,
      },
    ] as never);

    const result = await processGovernanceEvent({
      type: "ARTIFACT_PUBLISHED",
      projectId: "proj-1",
      details: { version: "1.0.0" },
    });

    expect(result.firedRules.find((r) => r.ruleId === "db-rule-2")).toBeUndefined();
  });
});
