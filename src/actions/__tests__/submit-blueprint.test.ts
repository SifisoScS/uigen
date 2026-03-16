import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/sifiso-gate", () => ({
  checkWithSovereignGate: vi.fn().mockResolvedValue({
    passed: true,
    ubuntu_score: 0.82,
    failed_predicates: [],
    rationale: "Gate bypassed — SIFISO_OS_URL not configured (development mode).",
    log_entry_id: "abc123".padEnd(64, "0"),
    bypassed: true,
  }),
}));

vi.mock("@/lib/forge", () => ({
  forgeValidateBlueprint: vi.fn().mockResolvedValue({
    valid: true,
    blueprint_id: "bp-test-1",
    message: "Blueprint accepted (stub).",
  }),
  forgeSubmitBuild: vi.fn().mockResolvedValue({
    build_id: "build-xyz-1",
    blueprint_id: "bp-test-1",
    grant_id: "abc123".padEnd(64, "0"),
    state: "COMPLETE",
    message: "Build completed (stub).",
    submitted_at: new Date().toISOString(),
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    governanceEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock("@/lib/ikhaya", () => ({
  ikhayaNarrate: vi.fn().mockResolvedValue({
    narrative: "The council affirmed this blueprint.",
    confidence: 0.9,
    tone: "affirming",
    references: [],
  }),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { checkWithSovereignGate } = await import("@/lib/sifiso-gate");
const { forgeValidateBlueprint, forgeSubmitBuild } = await import("@/lib/forge");
const { prisma } = await import("@/lib/prisma");
const { ikhayaNarrate } = await import("@/lib/ikhaya");
const { submitBlueprint } = await import("../submit-blueprint");

// ── Helpers ───────────────────────────────────────────────────────────────────

const SESSION = {
  userId: "user-abc",
  email: "test@example.com",
  expiresAt: new Date(Date.now() + 3_600_000),
};

const VALID_INPUT = {
  blueprintId: "bp-test-1",
  artifactType: "ui-component",
  name: "Hero Section",
  description: "A full-width hero section with CTA buttons",
  components: ["Button", "Heading", "Image"],
  filesHash: "deadbeef".repeat(8),
  semanticSummary: "Marketing hero block with primary call-to-action.",
};

const GATE_LOG_ENTRY_ID = "abc123".padEnd(64, "0");

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("submitBlueprint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(SESSION);
    vi.mocked(checkWithSovereignGate).mockResolvedValue({
      passed: true,
      ubuntu_score: 0.82,
      failed_predicates: [],
      rationale: "Gate bypassed.",
      log_entry_id: GATE_LOG_ENTRY_ID,
      bypassed: true,
    });
    vi.mocked(forgeValidateBlueprint).mockResolvedValue({
      valid: true,
      blueprint_id: VALID_INPUT.blueprintId,
      message: "Blueprint accepted (stub).",
    });
    vi.mocked(forgeSubmitBuild).mockResolvedValue({
      build_id: "build-xyz-1",
      blueprint_id: VALID_INPUT.blueprintId,
      grant_id: GATE_LOG_ENTRY_ID,
      state: "COMPLETE",
      message: "Build completed (stub).",
      submitted_at: new Date().toISOString(),
    });
    vi.mocked(prisma.governanceEvent.create).mockResolvedValue({} as never);
    vi.mocked(ikhayaNarrate).mockResolvedValue({
      narrative: "The council affirmed this blueprint.",
      confidence: 0.9,
      tone: "affirming",
      references: [],
    });
  });

  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(submitBlueprint(VALID_INPUT)).rejects.toThrow("Unauthorized");
  });

  it("calls checkWithSovereignGate with blueprint_submit action", async () => {
    await submitBlueprint(VALID_INPUT);
    expect(checkWithSovereignGate).toHaveBeenCalledWith(
      expect.objectContaining({ uigen_action: "blueprint_submit" })
    );
  });

  it("throws when gate fails", async () => {
    vi.mocked(checkWithSovereignGate).mockRejectedValue(
      new Error("Ubuntu alignment gate failed")
    );
    await expect(submitBlueprint(VALID_INPUT)).rejects.toThrow(
      "Ubuntu alignment gate failed"
    );
  });

  it("calls forgeValidateBlueprint before forgeSubmitBuild", async () => {
    const callOrder: string[] = [];
    vi.mocked(forgeValidateBlueprint).mockImplementation(async (bp) => {
      callOrder.push("validate");
      return { valid: true, blueprint_id: bp.blueprint_id, message: "ok" };
    });
    vi.mocked(forgeSubmitBuild).mockImplementation(async (req) => {
      callOrder.push("submit");
      return {
        build_id: "build-xyz-1",
        blueprint_id: req.blueprint.blueprint_id,
        grant_id: req.grant.grant_id,
        state: "COMPLETE" as const,
        message: "ok",
        submitted_at: new Date().toISOString(),
      };
    });
    await submitBlueprint(VALID_INPUT);
    expect(callOrder).toEqual(["validate", "submit"]);
  });

  it("passes grant_id equal to gate log_entry_id into forgeSubmitBuild", async () => {
    await submitBlueprint(VALID_INPUT);
    const call = vi.mocked(forgeSubmitBuild).mock.calls[0][0];
    expect(call.grant.grant_id).toBe(GATE_LOG_ENTRY_ID);
  });

  it("logs a FORGE_BUILD_SUBMITTED governance event with build_id", async () => {
    await submitBlueprint(VALID_INPUT);
    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "FORGE_BUILD_SUBMITTED",
          details: expect.objectContaining({ buildId: "build-xyz-1" }),
        }),
      })
    );
  });

  it("includes ubuntu_score in governance event details", async () => {
    await submitBlueprint(VALID_INPUT);
    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.objectContaining({ ubuntuScore: 0.82 }),
        }),
      })
    );
  });

  it("returns buildId and state from Forge response", async () => {
    const result = await submitBlueprint(VALID_INPUT);
    expect(result.buildId).toBe("build-xyz-1");
    expect(result.state).toBe("COMPLETE");
  });

  it("calls ikhayaNarrate exactly once", async () => {
    await submitBlueprint(VALID_INPUT);
    expect(ikhayaNarrate).toHaveBeenCalledTimes(1);
  });

  it("returns stub result when FORGE_URL is absent (forgeSubmitBuild falls through)", async () => {
    // forgeSubmitBuild is mocked to return stub data — this validates the
    // action returns a coherent result even without a real Forge service.
    const result = await submitBlueprint(VALID_INPUT);
    expect(result).toMatchObject({
      buildId: expect.any(String),
      state: expect.any(String),
      ubuntuScore: expect.any(Number),
      gateLogEntryId: expect.any(String),
    });
  });
});
