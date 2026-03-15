import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Helpers ────────────────────────────────────────────────────────────────────

const GATE_RESULT = {
  passed: true,
  ubuntu_score: 0.82,
  failed_predicates: [],
  rationale: "Constitutional alignment verified.",
  log_entry_id: "a".repeat(64),
};

const GATE_FAIL_RESULT = {
  passed: false,
  ubuntu_score: 0.45,
  failed_predicates: ["Ubuntu Alignment"],
  rationale: "Failed predicates: Ubuntu Alignment",
  log_entry_id: "b".repeat(64),
};

// Store original env
const originalEnv = { ...process.env };

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("checkWithSovereignGate — standalone mode (no SIFISO_OS_URL)", () => {
  beforeEach(() => {
    delete process.env.SIFISO_OS_URL;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    Object.assign(process.env, originalEnv);
    vi.unstubAllGlobals();
  });

  it("returns a permissive stub result when SIFISO_OS_URL is not set", async () => {
    const { checkWithSovereignGate } = await import("../sifiso-gate");
    const result = await checkWithSovereignGate({ uigen_action: "artifact_publish" });

    expect(result.passed).toBe(true);
    expect(result.ubuntu_score).toBeGreaterThanOrEqual(0.65);
    expect(result.bypassed).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stub result log_entry_id is 64 zero chars", async () => {
    const { checkWithSovereignGate } = await import("../sifiso-gate");
    const result = await checkWithSovereignGate({ uigen_action: "variant_approve" });

    expect(result.log_entry_id).toBe("0".repeat(64));
  });

  it("does not throw even with throwOnFail=true in standalone mode", async () => {
    const { checkWithSovereignGate } = await import("../sifiso-gate");
    await expect(
      checkWithSovereignGate({ uigen_action: "variant_publish" }, { throwOnFail: true })
    ).resolves.not.toThrow();
  });
});

describe("checkWithSovereignGate — connected mode (SIFISO_OS_URL set)", () => {
  beforeEach(() => {
    process.env.SIFISO_OS_URL = "http://sifiso-os:3000";
    process.env.UIGEN_SYSTEM_DID = "did:key:zuigen-test-node";
  });

  afterEach(() => {
    Object.assign(process.env, originalEnv);
    delete process.env.SIFISO_OS_URL;
    delete process.env.UIGEN_SYSTEM_DID;
    vi.unstubAllGlobals();
  });

  it("POSTs to /api/uigen/gate-check with the payload and initiator_did", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => GATE_RESULT,
    }));

    const { checkWithSovereignGate } = await import("../sifiso-gate");
    await checkWithSovereignGate({
      uigen_action: "artifact_publish",
      artifact_name: "AuthForm",
      human_approved: true,
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://sifiso-os:3000/api/uigen/gate-check");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.uigen_action).toBe("artifact_publish");
    expect(body.artifact_name).toBe("AuthForm");
    expect(body.initiator_did).toBe("did:key:zuigen-test-node");
  });

  it("returns the gate result when passed=true", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => GATE_RESULT,
    }));

    const { checkWithSovereignGate } = await import("../sifiso-gate");
    const result = await checkWithSovereignGate({ uigen_action: "artifact_publish" });

    expect(result.passed).toBe(true);
    expect(result.ubuntu_score).toBe(0.82);
    expect(result.log_entry_id).toBe("a".repeat(64));
    expect(result.bypassed).toBeUndefined();
  });

  it("throws when passed=false and throwOnFail=true (default)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => GATE_FAIL_RESULT,
    }));

    const { checkWithSovereignGate } = await import("../sifiso-gate");
    await expect(
      checkWithSovereignGate({ uigen_action: "artifact_publish" })
    ).rejects.toThrow(/ubuntu alignment gate failed/i);
  });

  it("does NOT throw when passed=false and throwOnFail=false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => GATE_FAIL_RESULT,
    }));

    const { checkWithSovereignGate } = await import("../sifiso-gate");
    const result = await checkWithSovereignGate(
      { uigen_action: "variant_approve" },
      { throwOnFail: false }
    );

    expect(result.passed).toBe(false);
    expect(result.ubuntu_score).toBe(0.45);
  });

  it("includes failed_predicates in the thrown error message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => GATE_FAIL_RESULT,
    }));

    const { checkWithSovereignGate } = await import("../sifiso-gate");
    await expect(
      checkWithSovereignGate({ uigen_action: "artifact_publish" })
    ).rejects.toThrow(/Ubuntu Alignment/);
  });

  it("throws when the gate returns a non-2xx status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "Unprocessable Entity",
    }));

    const { checkWithSovereignGate } = await import("../sifiso-gate");
    await expect(
      checkWithSovereignGate({ uigen_action: "artifact_publish" })
    ).rejects.toThrow(/422/);
  });

  it("fails open (returns stub) on network error instead of crashing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const { checkWithSovereignGate } = await import("../sifiso-gate");
    const result = await checkWithSovereignGate({ uigen_action: "variant_publish" });

    expect(result.passed).toBe(true);
    expect(result.bypassed).toBe(true);
  });

  it("strips trailing slash from SIFISO_OS_URL before building the endpoint URL", async () => {
    process.env.SIFISO_OS_URL = "http://sifiso-os:3000/";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => GATE_RESULT,
    }));

    const { checkWithSovereignGate } = await import("../sifiso-gate");
    await checkWithSovereignGate({ uigen_action: "artifact_publish" });

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://sifiso-os:3000/api/uigen/gate-check");
  });

  it("uses default DID when UIGEN_SYSTEM_DID is not set", async () => {
    delete process.env.UIGEN_SYSTEM_DID;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => GATE_RESULT,
    }));

    const { checkWithSovereignGate } = await import("../sifiso-gate");
    await checkWithSovereignGate({ uigen_action: "artifact_publish" });

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.initiator_did).toBe("did:key:zuigen-system-node-dev");
  });
});
