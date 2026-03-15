import { describe, it, expect } from "vitest";
import { computeEvaluationMetrics, PASS_THRESHOLD } from "../metrics";
import { detectRegressions } from "../regression";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeFilesData(content: string, path = "/App.tsx"): string {
  return JSON.stringify({
    type: "directory",
    name: "/",
    path: "/",
    children: {
      "App.tsx": { type: "file", name: "App.tsx", path, content },
    },
  });
}

const A11Y_RICH = makeFilesData(`
import { Button } from "@/components/ui/button";
export default function App() {
  return (
    <div>
      <button aria-label="Submit" onClick={() => {}}>Submit</button>
      <input aria-required="true" role="textbox" />
      <a href="#" aria-current="page">Home</a>
    </div>
  );
}
`);

const A11Y_POOR = makeFilesData(`
export default function App() {
  return (
    <div>
      <button onClick={() => {}}>Click</button>
      <input type="text" />
    </div>
  );
}
`);

const REGISTRY_HEAVY = makeFilesData(`
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
export default function App() {
  return <Card><Button /><Input /></Card>;
}
`);

// ── computeEvaluationMetrics ──────────────────────────────────────────────────

describe("computeEvaluationMetrics", () => {
  it("returns zero metrics for invalid JSON", () => {
    const result = computeEvaluationMetrics("not-json");
    expect(result.fileCount).toBe(0);
    expect(result.overallScore).toBe(0);
  });

  it("counts files and lines correctly", () => {
    const result = computeEvaluationMetrics(A11Y_RICH);
    expect(result.fileCount).toBe(1);
    expect(result.linesOfCode).toBeGreaterThan(5);
  });

  it("a11y-rich code scores higher accessibilityScore than a11y-poor code", () => {
    const rich = computeEvaluationMetrics(A11Y_RICH);
    const poor = computeEvaluationMetrics(A11Y_POOR);
    expect(rich.accessibilityScore).toBeGreaterThan(poor.accessibilityScore);
  });

  it("registry-heavy code scores higher componentCoverage than vanilla JSX", () => {
    const rich = computeEvaluationMetrics(REGISTRY_HEAVY);
    const poor = computeEvaluationMetrics(A11Y_POOR);
    expect(rich.componentCoverage).toBeGreaterThan(poor.componentCoverage);
  });

  it("overallScore is within [0, 1]", () => {
    for (const data of [A11Y_RICH, A11Y_POOR, REGISTRY_HEAVY]) {
      const result = computeEvaluationMetrics(data);
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(1);
    }
  });

  it("overallScore is weighted composite of the three sub-scores", () => {
    const m = computeEvaluationMetrics(A11Y_RICH);
    const expected = parseFloat(
      (m.accessibilityScore * 0.4 + m.componentCoverage * 0.35 + m.styleConsistency * 0.25).toFixed(4)
    );
    expect(m.overallScore).toBeCloseTo(expected, 4);
  });

  it(`PASS_THRESHOLD is ${PASS_THRESHOLD}`, () => {
    expect(PASS_THRESHOLD).toBe(0.4);
  });
});

// ── detectRegressions ─────────────────────────────────────────────────────────

describe("detectRegressions", () => {
  const GOOD_BASELINE = {
    accessibilityScore: 0.8,
    componentCoverage: 0.7,
    styleConsistency: 0.9,
    fileCount: 3,
    linesOfCode: 100,
    overallScore: 0.8,
  };

  it("returns no regressions when current matches baseline", () => {
    const report = detectRegressions(GOOD_BASELINE, GOOD_BASELINE);
    expect(report.regressionDetected).toBe(false);
    expect(report.regressions).toHaveLength(0);
  });

  it("detects accessibilityScore regression when drop > 0.15", () => {
    const current = { ...GOOD_BASELINE, accessibilityScore: 0.6, overallScore: 0.65 };
    const report = detectRegressions(GOOD_BASELINE, current);
    expect(report.regressionDetected).toBe(true);
    const detail = report.regressions.find((r) => r.metric === "accessibilityScore");
    expect(detail).toBeDefined();
    expect(detail!.drop).toBeGreaterThan(0.15);
  });

  it("does not flag a drop below the threshold", () => {
    // Drop of 0.1 on accessibilityScore — below 0.15 threshold
    const current = { ...GOOD_BASELINE, accessibilityScore: 0.71 };
    const report = detectRegressions(GOOD_BASELINE, current);
    const a11y = report.regressions.find((r) => r.metric === "accessibilityScore");
    expect(a11y).toBeUndefined();
  });

  it("reports multiple simultaneous regressions", () => {
    const current = {
      ...GOOD_BASELINE,
      accessibilityScore: 0.5,  // drop 0.3 > 0.15
      componentCoverage: 0.4,   // drop 0.3 > 0.2
      overallScore: 0.5,        // drop 0.3 > 0.15
    };
    const report = detectRegressions(GOOD_BASELINE, current);
    expect(report.regressionDetected).toBe(true);
    expect(report.regressions.length).toBeGreaterThanOrEqual(2);
  });
});
