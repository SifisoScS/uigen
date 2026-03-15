import { describe, it, expect } from "vitest";
import { computeSemanticDelta } from "../semantic-delta";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFilesData(files: Record<string, string>): string {
  const obj: Record<string, { type: string; name: string; path: string; content: string }> = {};
  for (const [path, content] of Object.entries(files)) {
    const name = path.split("/").pop() ?? path;
    obj[path] = { type: "file", name, path, content };
  }
  return JSON.stringify(obj);
}

const EMPTY = makeFilesData({});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("computeSemanticDelta", () => {
  it("returns zero delta for identical filesData", () => {
    const files = makeFilesData({ "/App.jsx": "<div><Button>Click</Button></div>" });
    const delta = computeSemanticDelta(files, files);
    expect(delta.addedComponents).toHaveLength(0);
    expect(delta.removedComponents).toHaveLength(0);
    expect(delta.a11yDelta).toBe(0);
    expect(delta.linesChanged).toBe(0);
  });

  it("detects added components", () => {
    const from = makeFilesData({ "/App.jsx": "<div><Button>OK</Button></div>" });
    const to   = makeFilesData({ "/App.jsx": "<div><Button>OK</Button><Dialog /><Input /></div>" });
    const delta = computeSemanticDelta(from, to);
    expect(delta.addedComponents).toContain("Dialog");
    expect(delta.addedComponents).toContain("Input");
    expect(delta.removedComponents).toHaveLength(0);
  });

  it("detects removed components", () => {
    const from = makeFilesData({ "/App.jsx": "<Card><Button>Go</Button></Card>" });
    const to   = makeFilesData({ "/App.jsx": "<div><Button>Go</Button></div>" });
    const delta = computeSemanticDelta(from, to);
    expect(delta.removedComponents).toContain("Card");
    expect(delta.addedComponents).toHaveLength(0);
  });

  it("counts positive a11y delta when aria attributes are added", () => {
    const from = makeFilesData({ "/App.jsx": '<button>Click</button>' });
    const to   = makeFilesData({ "/App.jsx": '<button aria-label="Submit" role="button">Click</button>' });
    const delta = computeSemanticDelta(from, to);
    expect(delta.a11yDelta).toBe(2); // aria-label + role=
  });

  it("counts negative a11y delta when aria attributes are removed", () => {
    const from = makeFilesData({ "/App.jsx": '<img alt="logo" aria-hidden="true" />' });
    const to   = makeFilesData({ "/App.jsx": '<img />' });
    const delta = computeSemanticDelta(from, to);
    expect(delta.a11yDelta).toBe(-2); // alt= + aria-hidden removed
  });

  it("counts linesChanged as sum of |toLines - fromLines| per file", () => {
    const from = makeFilesData({ "/App.jsx": "line1\nline2\nline3" });     // 3 lines
    const to   = makeFilesData({ "/App.jsx": "line1\nline2\nline3\nline4\nline5" }); // 5 lines
    const delta = computeSemanticDelta(from, to);
    expect(delta.linesChanged).toBe(2);
  });

  it("handles empty fromFilesData gracefully", () => {
    const to = makeFilesData({ "/App.jsx": "<Button />" });
    const delta = computeSemanticDelta(EMPTY, to);
    expect(delta.addedComponents).toContain("Button");
    expect(delta.removedComponents).toHaveLength(0);
    expect(delta.linesChanged).toBeGreaterThan(0);
  });

  it("handles empty toFilesData gracefully", () => {
    const from = makeFilesData({ "/App.jsx": "<Button />" });
    const delta = computeSemanticDelta(from, EMPTY);
    expect(delta.removedComponents).toContain("Button");
    expect(delta.addedComponents).toHaveLength(0);
  });

  it("counts lines across multiple files", () => {
    const from = makeFilesData({
      "/App.jsx": "a\nb\nc",         // 3 lines
      "/Header.jsx": "x\ny",          // 2 lines
    });
    const to = makeFilesData({
      "/App.jsx": "a\nb\nc\nd\ne",   // 5 lines → +2
      "/Header.jsx": "x",             // 1 line  → -1
    });
    const delta = computeSemanticDelta(from, to);
    expect(delta.linesChanged).toBe(3); // 2 + 1
  });

  it("modifiedProps is always an empty object (stub)", () => {
    const from = makeFilesData({ "/App.jsx": "<Button variant='primary' />" });
    const to   = makeFilesData({ "/App.jsx": "<Button variant='secondary' />" });
    const delta = computeSemanticDelta(from, to);
    expect(delta.modifiedProps).toEqual({});
  });

  it("does not throw on invalid JSON filesData", () => {
    expect(() => computeSemanticDelta("not-json", "also-not-json")).not.toThrow();
    const delta = computeSemanticDelta("not-json", "also-not-json");
    expect(delta.addedComponents).toHaveLength(0);
    expect(delta.linesChanged).toBe(0);
  });
});
