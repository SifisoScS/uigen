/** Shared virtual-FS utilities used by publish, merge, and conflict resolution. */

export interface FileEntry {
  path: string;
  content: string;
}

export interface ConflictingFile {
  path: string;
  originalContent: string;
  variantContent: string;
}

export type Resolution = {
  path: string;
  /** Kept for backward-compat with existing callers that use pick-one-side semantics. */
  choice?: "original" | "variant";
  /**
   * When present (e.g. from a Monaco editor), used as the final file content
   * directly — overrides `choice`. Enables manual edits beyond the original /
   * variant binary choice.
   */
  resolvedContent?: string;
};

// ── Tree traversal ────────────────────────────────────────────────────────────

/** Recursively walk a nested virtual-FS tree and return all file entries. */
export function walkVirtualFS(node: unknown): FileEntry[] {
  if (!node || typeof node !== "object") return [];
  const n = node as Record<string, unknown>;
  const files: FileEntry[] = [];
  if (n.type === "file" && typeof n.path === "string" && typeof n.content === "string") {
    files.push({ path: n.path, content: n.content });
  }
  if (n.children && typeof n.children === "object") {
    for (const child of Object.values(n.children as Record<string, unknown>)) {
      files.push(...walkVirtualFS(child));
    }
  }
  return files;
}

/** Parse a serialised project `data` field into a flat list of FileEntry. */
export function parseFilesData(data: string): FileEntry[] {
  try {
    return walkVirtualFS(JSON.parse(data));
  } catch {
    return [];
  }
}

// ── Conflict detection ────────────────────────────────────────────────────────

/**
 * Compare two serialised project `data` strings.
 * Returns one `ConflictingFile` entry for every path that exists in BOTH and has
 * different content.
 */
export function detectConflicts(
  originalData: string,
  variantData: string
): ConflictingFile[] {
  const originalFiles = parseFilesData(originalData);
  const variantFiles = parseFilesData(variantData);

  const originalMap = new Map<string, string>(
    originalFiles.map((f) => [f.path, f.content])
  );

  const conflicts: ConflictingFile[] = [];
  for (const { path, content: variantContent } of variantFiles) {
    const originalContent = originalMap.get(path);
    if (originalContent !== undefined && originalContent !== variantContent) {
      conflicts.push({ path, originalContent, variantContent });
    }
  }
  return conflicts;
}

// ── FS reconstruction ─────────────────────────────────────────────────────────

interface FSNode {
  type: "file" | "directory";
  name: string;
  path: string;
  content?: string;
  children?: Record<string, FSNode>;
}

/** Build a nested virtual-FS tree from a flat array of FileEntry. */
export function buildNestedFS(files: FileEntry[]): FSNode {
  const root: FSNode = {
    type: "directory",
    name: "/",
    path: "/",
    children: {},
  };

  for (const { path, content } of files) {
    const parts = path.replace(/^\//, "").split("/");
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const dirPath = "/" + parts.slice(0, i + 1).join("/");
      if (!current.children![part]) {
        current.children![part] = {
          type: "directory",
          name: part,
          path: dirPath,
          children: {},
        };
      }
      current = current.children![part];
    }

    const fileName = parts[parts.length - 1];
    current.children![fileName] = {
      type: "file",
      name: fileName,
      path,
      content,
    };
  }

  return root;
}

// ── Resolution application ────────────────────────────────────────────────────

/**
 * Apply per-file conflict resolutions to produce a merged flat file list.
 *
 * Strategy:
 * - Files only in the original                → keep original
 * - Files only in the variant                 → add from variant (new file)
 * - Files in both with identical content      → keep (no conflict)
 * - Files in both with different content      → apply resolution:
 *     "original" = keep original content
 *     "variant"  = take variant content
 */
export function applyResolutions(
  originalData: string,
  variantData: string,
  resolutions: Resolution[]
): FileEntry[] {
  const originalFiles = parseFilesData(originalData);
  const variantFiles = parseFilesData(variantData);

  const originalMap = new Map<string, string>(
    originalFiles.map((f) => [f.path, f.content])
  );
  const variantMap = new Map<string, string>(
    variantFiles.map((f) => [f.path, f.content])
  );
  const resolutionMap = new Map<string, Resolution>(
    resolutions.map((r) => [r.path, r])
  );

  // Start with original files
  const merged = new Map<string, string>(originalMap);

  // Apply variant files on top
  for (const [path, variantContent] of variantMap) {
    const originalContent = originalMap.get(path);
    if (originalContent === undefined) {
      // File only in variant → add it
      merged.set(path, variantContent);
    } else if (originalContent !== variantContent) {
      // Conflict → apply resolution (default: keep original)
      const resolution = resolutionMap.get(path);
      if (resolution?.resolvedContent !== undefined) {
        // Manual edit from Monaco editor takes priority
        merged.set(path, resolution.resolvedContent);
      } else if ((resolution?.choice ?? "original") === "variant") {
        merged.set(path, variantContent);
      }
    }
    // else same content → no-op
  }

  return [...merged.entries()].map(([path, content]) => ({ path, content }));
}
