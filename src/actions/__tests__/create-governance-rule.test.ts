import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    governanceRule: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { createGovernanceRule, toggleGovernanceRule } = await import("../create-governance-rule");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION = { userId: "user-1", email: "test@example.com", expiresAt: new Date(Date.now() + 3_600_000) };

const RULE_RECORD = {
  id: "rule-1",
  name: "Lock on fail",
  description: null,
  eventType: "EVALUATION_RUN_COMPLETED",
  condition: { field: "status", operator: "eq", value: "FAILED" },
  action: { type: "LOCK_BRANCH", params: { branchPrefix: "release/" } },
  enabled: true,
  createdAt: new Date(),
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(SESSION);
  vi.mocked(prisma.governanceRule.create).mockResolvedValue(RULE_RECORD as never);
  vi.mocked(prisma.governanceRule.findUnique).mockResolvedValue(RULE_RECORD as never);
  vi.mocked(prisma.governanceRule.update).mockResolvedValue({ id: "rule-1", enabled: false } as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("createGovernanceRule", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(
      createGovernanceRule({ name: "Test", eventType: "X", action: { type: "LOG_EVENT" } })
    ).rejects.toThrow(/unauthorized/i);
  });

  it("throws when name is empty", async () => {
    await expect(
      createGovernanceRule({ name: "   ", eventType: "X", action: { type: "LOG_EVENT" } })
    ).rejects.toThrow(/name cannot be empty/i);
  });

  it("throws when eventType is empty", async () => {
    await expect(
      createGovernanceRule({ name: "Rule", eventType: "  ", action: { type: "LOG_EVENT" } })
    ).rejects.toThrow(/eventType cannot be empty/i);
  });

  it("creates a rule and returns the record", async () => {
    const result = await createGovernanceRule({
      name: "Lock on fail",
      eventType: "EVALUATION_RUN_COMPLETED",
      condition: { field: "status", operator: "eq", value: "FAILED" },
      action: { type: "LOCK_BRANCH", params: { branchPrefix: "release/" } },
    });

    expect(result.id).toBe("rule-1");
    expect(result.name).toBe("Lock on fail");
    expect(result.enabled).toBe(true);
    expect(result.condition).toEqual({ field: "status", operator: "eq", value: "FAILED" });
  });

  it("passes enabled=true by default", async () => {
    await createGovernanceRule({
      name: "My Rule",
      eventType: "X",
      action: { type: "LOG_EVENT" },
    });

    expect(prisma.governanceRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ enabled: true }),
      })
    );
  });
});

describe("toggleGovernanceRule", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(toggleGovernanceRule("rule-1", false)).rejects.toThrow(/unauthorized/i);
  });

  it("throws when rule does not exist", async () => {
    vi.mocked(prisma.governanceRule.findUnique).mockResolvedValue(null);
    await expect(toggleGovernanceRule("bad-id", false)).rejects.toThrow(/not found/i);
  });

  it("disables a rule", async () => {
    const result = await toggleGovernanceRule("rule-1", false);
    expect(result.enabled).toBe(false);
    expect(prisma.governanceRule.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enabled: false } })
    );
  });
});
