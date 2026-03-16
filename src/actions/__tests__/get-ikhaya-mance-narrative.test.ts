import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/ikhaya", () => ({
  ikhayaMANCEDeliberate: vi.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { ikhayaMANCEDeliberate } = await import("@/lib/ikhaya");
const { getIKhayaManceNarrative } = await import("../get-ikhaya-mance-narrative");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MANCE_RESPONSE = {
  deliberation_transcript: [
    { agent: "Claude", statement: "The community's best interest guides this." },
    { agent: "Grok",   statement: "Grok speaks in agreement." },
  ],
  consensus_summary: "Two agents reached consensus in the spirit of Ubuntu.",
  dissenting_views: [],
  recommended_action: "Proceed with community awareness.",
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ikhayaMANCEDeliberate).mockResolvedValue(MANCE_RESPONSE);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getIKhayaManceNarrative", () => {
  it("constructs synthetic DIDs using did:key:z{name.toLowerCase()} pattern", async () => {
    await getIKhayaManceNarrative({
      artifactId: "art-1",
      agentNames: ["Claude", "Grok"],
      prompt: "Should we publish?",
    });

    expect(ikhayaMANCEDeliberate).toHaveBeenCalledWith(
      expect.objectContaining({
        agents: [
          { did: "did:key:zclaude", name: "Claude" },
          { did: "did:key:zgrok",   name: "Grok" },
        ],
      })
    );
  });

  it("always includes artifactId in context", async () => {
    await getIKhayaManceNarrative({
      artifactId: "art-42",
      agentNames: ["Claude"],
      prompt: "Proceed?",
    });

    const call = vi.mocked(ikhayaMANCEDeliberate).mock.calls[0][0];
    expect((call.context as Record<string, unknown>).artifactId).toBe("art-42");
  });

  it("includes mergedSuggestions in context when provided and non-empty", async () => {
    const suggestions = [{ text: "Add aria-label", score: 0.9 }];
    await getIKhayaManceNarrative({
      artifactId: "art-1",
      agentNames: ["Claude"],
      prompt: "Proceed?",
      mergedSuggestions: suggestions,
    });

    const call = vi.mocked(ikhayaMANCEDeliberate).mock.calls[0][0];
    expect((call.context as Record<string, unknown>).mergedSuggestions).toEqual(suggestions);
  });

  it("omits mergedSuggestions from context when array is empty", async () => {
    await getIKhayaManceNarrative({
      artifactId: "art-1",
      agentNames: ["Claude"],
      prompt: "Proceed?",
      mergedSuggestions: [],
    });

    const call = vi.mocked(ikhayaMANCEDeliberate).mock.calls[0][0];
    expect((call.context as Record<string, unknown>).mergedSuggestions).toBeUndefined();
  });

  it("includes topAgent in context when provided", async () => {
    await getIKhayaManceNarrative({
      artifactId: "art-1",
      agentNames: ["Claude"],
      prompt: "Proceed?",
      topAgent: "Claude",
    });

    const call = vi.mocked(ikhayaMANCEDeliberate).mock.calls[0][0];
    expect((call.context as Record<string, unknown>).topAgent).toBe("Claude");
  });

  it("omits topAgent from context when not provided", async () => {
    await getIKhayaManceNarrative({
      artifactId: "art-1",
      agentNames: ["Claude"],
      prompt: "Proceed?",
    });

    const call = vi.mocked(ikhayaMANCEDeliberate).mock.calls[0][0];
    expect((call.context as Record<string, unknown>).topAgent).toBeUndefined();
  });

  it("passes prompt through to ikhayaMANCEDeliberate unchanged", async () => {
    const prompt = "Should the council endorse this artifact for release?";
    await getIKhayaManceNarrative({ artifactId: "art-1", agentNames: ["Claude"], prompt });
    expect(ikhayaMANCEDeliberate).toHaveBeenCalledWith(
      expect.objectContaining({ prompt })
    );
  });

  it("returns the MANCEDeliberateResponse from ikhayaMANCEDeliberate unchanged", async () => {
    const result = await getIKhayaManceNarrative({
      artifactId: "art-1",
      agentNames: ["Claude", "Grok"],
      prompt: "Proceed?",
    });

    expect(result).toEqual(MANCE_RESPONSE);
    expect(result.deliberation_transcript).toHaveLength(2);
    expect(result.consensus_summary).toBe("Two agents reached consensus in the spirit of Ubuntu.");
    expect(result.recommended_action).toBe("Proceed with community awareness.");
    expect(result.dissenting_views).toEqual([]);
  });
});
