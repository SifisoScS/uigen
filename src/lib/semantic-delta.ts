/**
 * Semantic delta computation between two artifact file-system snapshots.
 *
 * This is a pure module (no "use server", no DB access) so it can be imported
 * by both server actions and tests without side-effects.
 *
 * The analysis uses regex-based heuristics on JSX source text rather than a
 * full AST, which is fast and sufficient for the "stub-v1" model.  When a real
 * Babel/SWC parser is wired in, replace `extractComponents` and `modifiedProps`
 * with the AST-based equivalents; the `SemanticDelta` shape remains stable.
 */

export interface SemanticDelta {
  /** Component types present in `to` but absent in `from`. */
  addedComponents: string[];
  /** Component types present in `from` but absent in `to`. */
  removedComponents: string[];
  /**
   * Per-component map of props that appear to have changed.
   * Stub: always {} until AST diffing is implemented.
   */
  modifiedProps: Record<string, string[]>;
  /** Net change in a11y-relevant attribute count (positive = more accessible). */
  a11yDelta: number;
  /** Sum of |toLines − fromLines| across all files in the diff. */
  linesChanged: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract every PascalCase JSX opening tag found in `content`. */
function extractComponents(content: string): Set<string> {
  const result = new Set<string>();
  for (const m of content.matchAll(/<([A-Z][A-Za-z0-9]*)/g)) {
    result.add(m[1]);
  }
  return result;
}

/** Count accessibility-relevant attributes in a source string. */
function countA11y(content: string): number {
  const patterns: RegExp[] = [
    /aria-\w+/g,
    /\brole=/g,
    /\btabIndex\b/g,
    /\balt=/g,
  ];
  return patterns.reduce((sum, p) => sum + (content.match(p)?.length ?? 0), 0);
}

/**
 * Parse a `filesData` JSON string (Project.data format) into a
 * `Map<filePath, content>`.  Invalid JSON produces an empty map.
 */
function parseFiles(filesData: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!filesData) return result;
  try {
    const parsed = JSON.parse(filesData) as Record<string, unknown>;
    for (const [path, node] of Object.entries(parsed)) {
      if (node && typeof node === "object" && "content" in node) {
        const content = (node as Record<string, unknown>).content;
        if (typeof content === "string") result.set(path, content);
      }
    }
  } catch {
    // malformed JSON → treat as empty
  }
  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute a structural semantic diff between two artifact filesData snapshots.
 *
 * @param fromFilesData  Serialised file-system JSON of the parent artifact.
 * @param toFilesData    Serialised file-system JSON of the new artifact.
 */
export function computeSemanticDelta(
  fromFilesData: string,
  toFilesData: string
): SemanticDelta {
  const fromFiles = parseFiles(fromFilesData);
  const toFiles   = parseFiles(toFilesData);

  // ── Component sets ─────────────────────────────────────────────────────────
  const fromComponents = new Set<string>();
  const toComponents   = new Set<string>();

  for (const content of fromFiles.values()) {
    for (const c of extractComponents(content)) fromComponents.add(c);
  }
  for (const content of toFiles.values()) {
    for (const c of extractComponents(content)) toComponents.add(c);
  }

  const addedComponents   = [...toComponents].filter((c) => !fromComponents.has(c)).sort();
  const removedComponents = [...fromComponents].filter((c) => !toComponents.has(c)).sort();

  // ── A11y delta ─────────────────────────────────────────────────────────────
  const fromA11y = [...fromFiles.values()].reduce((s, c) => s + countA11y(c), 0);
  const toA11y   = [...toFiles.values()].reduce((s, c)   => s + countA11y(c), 0);
  const a11yDelta = toA11y - fromA11y;

  // ── Lines changed ──────────────────────────────────────────────────────────
  const allPaths = new Set([...fromFiles.keys(), ...toFiles.keys()]);
  let linesChanged = 0;
  for (const path of allPaths) {
    // Treat a missing file as 0 lines (not 1) so new/deleted files contribute
    // their full line count rather than a spurious ±1 bias.
    const fromLines = fromFiles.has(path) ? fromFiles.get(path)!.split("\n").length : 0;
    const toLines   = toFiles.has(path)   ? toFiles.get(path)!.split("\n").length   : 0;
    linesChanged   += Math.abs(toLines - fromLines);
  }

  return {
    addedComponents,
    removedComponents,
    modifiedProps: {},   // stub — real prop diffing requires an AST
    a11yDelta,
    linesChanged,
  };
}
