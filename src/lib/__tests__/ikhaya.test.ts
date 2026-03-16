import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Imports ───────────────────────────────────────────────────────────────────

const { ikhayaNarrate, ikhayaInterpretLineage, ikhayaMANCEDeliberate } =
  await import("@/lib/ikhaya");

// ── Helpers ───────────────────────────────────────────────────────────────────

const REAL_LOG_ID = "a".repeat(64);
const BYPASSED_LOG_ID = "0".repeat(64);

function mockOk(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ikhayaNarrate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SIFISO_OS_URL;
  });

  it("returns affirming stub when SIFISO_OS_URL is not set and score >= 0.75", async () => {
    const res = await ikhayaNarrate({
      artifact_id: "art-1",
      ubuntu_score: 0.85,
      gate_log_entry_id: REAL_LOG_ID,
    });
    expect(res.tone).toBe("affirming");
    expect(res.narrative).toContain("art-1");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns cautionary stub for score >= 0.65 and < 0.75", async () => {
    const res = await ikhayaNarrate({
      artifact_id: "art-2",
      ubuntu_score: 0.68,
      gate_log_entry_id: REAL_LOG_ID,
    });
    expect(res.tone).toBe("cautionary");
  });

  it("returns warning stub for score < 0.65", async () => {
    const res = await ikhayaNarrate({
      artifact_id: "art-3",
      ubuntu_score: 0.50,
      gate_log_entry_id: REAL_LOG_ID,
    });
    expect(res.tone).toBe("warning");
  });

  it("returns bypassed stub when gate_log_entry_id is 64 zeros", async () => {
    const res = await ikhayaNarrate({
      artifact_id: "art-bypass",
      ubuntu_score: 0.82,
      gate_log_entry_id: BYPASSED_LOG_ID,
    });
    expect(res.tone).toBe("bypassed");
    expect(res.confidence).toBe(0.5);
    expect(res.references).toHaveLength(0);
  });

  it("calls Sifiso OS when SIFISO_OS_URL is set and returns server response", async () => {
    process.env.SIFISO_OS_URL = "http://localhost:3001";
    const serverResponse = {
      narrative: "The council affirmed this.",
      confidence: 0.93,
      tone: "affirming",
      references: ["gate:abcdef123456789…"],
    };
    mockFetch.mockReturnValueOnce(mockOk(serverResponse));

    const res = await ikhayaNarrate({
      artifact_id: "art-connected",
      ubuntu_score: 0.88,
      gate_log_entry_id: REAL_LOG_ID,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/ikhaya/narrate",
      expect.objectContaining({ method: "POST" })
    );
    expect(res.narrative).toBe("The council affirmed this.");
    expect(res.tone).toBe("affirming");
  });

  it("falls back to stub when Sifiso OS is unreachable (network error)", async () => {
    process.env.SIFISO_OS_URL = "http://localhost:3001";
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const res = await ikhayaNarrate({
      artifact_id: "art-fallback",
      ubuntu_score: 0.82,
      gate_log_entry_id: REAL_LOG_ID,
    });

    expect(res.narrative).toContain("art-fallback");
    expect(typeof res.tone).toBe("string");
  });

  it("strips trailing slash from SIFISO_OS_URL", async () => {
    process.env.SIFISO_OS_URL = "http://localhost:3001/";
    mockFetch.mockReturnValueOnce(mockOk({
      narrative: "ok", confidence: 0.9, tone: "affirming", references: [],
    }));

    await ikhayaNarrate({
      artifact_id: "art-slash",
      ubuntu_score: 0.80,
      gate_log_entry_id: REAL_LOG_ID,
    });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe("http://localhost:3001/api/ikhaya/narrate");
    expect(url).not.toContain("//api");
  });
});

describe("ikhayaInterpretLineage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SIFISO_OS_URL;
  });

  it("returns stub when SIFISO_OS_URL is not set", async () => {
    const res = await ikhayaInterpretLineage({
      artifact_id: "art-lin-1",
      lineage_graph: [{ id: "v1" }, { id: "v2" }],
    });
    expect(res.summary).toContain("art-lin-1");
    expect(Array.isArray(res.change_list)).toBe(true);
    expect(typeof res.reasoning_narrative).toBe("string");
  });

  it("returns server response when connected", async () => {
    process.env.SIFISO_OS_URL = "http://localhost:3001";
    const serverResponse = {
      summary: "Two generations.",
      change_list: ["Added: Button"],
      reasoning_narrative: "The community grew.",
      ubuntu_alignment_notes: "Accessibility maintained.",
    };
    mockFetch.mockReturnValueOnce(mockOk(serverResponse));

    const res = await ikhayaInterpretLineage({ artifact_id: "art-lin-2" });
    expect(res.summary).toBe("Two generations.");
    expect(res.change_list).toContain("Added: Button");
  });
});

describe("ikhayaMANCEDeliberate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SIFISO_OS_URL;
  });

  it("returns stub with one transcript entry per agent when not connected", async () => {
    const res = await ikhayaMANCEDeliberate({
      agents: [
        { did: "did:key:zagent1", name: "Claude" },
        { did: "did:key:zagent2", name: "Grok" },
      ],
      prompt: "Publish?",
    });
    expect(res.deliberation_transcript).toHaveLength(2);
    expect(typeof res.consensus_summary).toBe("string");
    expect(typeof res.recommended_action).toBe("string");
  });
});
