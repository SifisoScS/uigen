import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    publicArtifact: { findUnique: vi.fn() },
    governanceEvent: { create: vi.fn() },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { scoreCritiqueSuggestions, AUTO_SELECT_THRESHOLD } = await import(
  "../score-critique-suggestions"
);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION = {
  userId: "user-abc",
  email: "test@example.com",
  expiresAt: new Date(Date.now() + 3_600_000),
};

// Minimal virtual-FS tree: one App.tsx with a Button component and aria-label
const FILES_DATA = JSON.stringify({
  type: "directory",
  name: "/",
  path: "/",
  children: {
    "App.tsx": {
      type: "file",
      name: "App.tsx",
      path: "/App.tsx",
      content: `
import { Button } from "@/components/ui/button";
export default function App() {
  return (
    <div className="flex gap-4 bg-blue-500 text-white p-4">
      <Button aria-label="Submit" onClick={() => {}}>Submit</Button>
    </div>
  );
}
`,
    },
  },
});

const ARTIFACT = {
  id: "art-1",
  projectId: "proj-1",
  name: "Button Demo",
  filesData: FILES_DATA,
  semanticSummary: "Button Demo — interactive, form",
  styleSignature: { usedComponents: ["Button"], colors: ["bg-blue-500", "text-white"], classes: [], spacing: [], propSummary: {} },
  manifest: { tags: ["button", "form"], governancePolicy: "OPEN" },
};

const SUGGESTIONS = [
  {
    text: "Add aria-label to the Button for accessibility",
    score: 0.9,
    contributors: ["Claude", "Grok"],
  },
  {
    text: "Replace dropdown with shadcn Select component",
    score: 0.85,
    contributors: ["Grok"],
  },
  {
    text: "Improve contrast ratio on text elements",
    score: 0.6,
    contributors: ["Claude"],
  },
];

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(SESSION);
  vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(ARTIFACT as never);
  vi.mocked(prisma.governanceEvent.create).mockResolvedValue({ id: "evt-1" } as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("scoreCritiqueSuggestions", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await expect(
      scoreCritiqueSuggestions({ artifactId: "art-1", suggestions: SUGGESTIONS })
    ).rejects.toThrow(/unauthorized/i);
  });

  it("throws when artifact is not found", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(null);

    await expect(
      scoreCritiqueSuggestions({ artifactId: "nonexistent", suggestions: SUGGESTIONS })
    ).rejects.toThrow(/artifact not found/i);
  });

  it("returns empty scoredSuggestions when suggestions array is empty", async () => {
    const result = await scoreCritiqueSuggestions({ artifactId: "art-1", suggestions: [] });

    expect(result.scoredSuggestions).toHaveLength(0);
    expect(result.autoSelectCount).toBe(0);
  });

  it("results are sorted by expectedImpactScore descending", async () => {
    const result = await scoreCritiqueSuggestions({ artifactId: "art-1", suggestions: SUGGESTIONS });

    const scores = result.scoredSuggestions.map((s) => s.expectedImpactScore);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });

  it("accessibility suggestion gets relevance bonus and scores higher than a low-reputation unrelated suggestion", async () => {
    const a11ySuggestion = {
      text: "Add aria-label and keyboard focus support",
      score: 0.7,
      contributors: ["Claude"],
    };
    const unrelatedSuggestion = {
      text: "Rewrite routing logic for pagination flow",
      score: 0.6,
      contributors: ["Grok"],
    };

    const result = await scoreCritiqueSuggestions({
      artifactId: "art-1",
      suggestions: [unrelatedSuggestion, a11ySuggestion],
    });

    const a11y = result.scoredSuggestions.find((s) =>
      s.text.includes("aria-label")
    )!;
    const unrelated = result.scoredSuggestions.find((s) =>
      s.text.includes("pagination")
    )!;
    expect(a11y.relevanceScore).toBeGreaterThan(unrelated.relevanceScore);
  });

  it("shared suggestions (multiple contributors) get higher safetyScore than solo suggestions", async () => {
    const sharedSugg = { text: "Improve button contrast", score: 0.8, contributors: ["Claude", "Grok"] };
    const soloSugg = { text: "Add loading spinner", score: 0.8, contributors: ["Claude"] };

    const result = await scoreCritiqueSuggestions({
      artifactId: "art-1",
      suggestions: [soloSugg, sharedSugg],
    });

    const shared = result.scoredSuggestions.find((s) => s.contributors.length > 1)!;
    const solo = result.scoredSuggestions.find((s) => s.contributors.length === 1)!;
    expect(shared.safetyScore).toBeGreaterThan(solo.safetyScore);
  });

  it("autoSelectCount equals the number of suggestions with expectedImpactScore >= threshold", async () => {
    const result = await scoreCritiqueSuggestions({ artifactId: "art-1", suggestions: SUGGESTIONS });

    const aboveThreshold = result.scoredSuggestions.filter(
      (s) => s.expectedImpactScore >= AUTO_SELECT_THRESHOLD
    ).length;
    expect(result.autoSelectCount).toBe(aboveThreshold);
  });

  it("logs ARTIFACT_SUGGESTIONS_SCORED governance event with correct fields", async () => {
    await scoreCritiqueSuggestions({ artifactId: "art-1", suggestions: SUGGESTIONS });

    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ARTIFACT_SUGGESTIONS_SCORED",
          projectId: "proj-1",
          actor: "system",
          details: expect.objectContaining({
            artifactId: "art-1",
            suggestionCount: 3,
            autoSelectCount: expect.any(Number),
            topSuggestion: expect.any(String),
          }),
        }),
      })
    );
  });

  it("artifactComplexity reflects file count (1 file → near 0 complexity)", async () => {
    const result = await scoreCritiqueSuggestions({ artifactId: "art-1", suggestions: SUGGESTIONS });

    // 1 file → complexityFactor = 1/10 = 0.1
    expect(result.artifactComplexity).toBeCloseTo(0.1, 2);
  });
});
