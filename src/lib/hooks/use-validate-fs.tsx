"use client";

/**
 * useValidateFs
 *
 * Runs lightweight static analysis on the virtual FS after each generation
 * stream completes. If potential issues are detected it calls `onIssues` so
 * the caller can surface a follow-up message to the user.
 *
 * Analysis checks:
 *  1. JSX element usage without a corresponding import (simple heuristic)
 *  2. Missing /App.tsx or /App.jsx entry point
 *  3. Files that reference @/ aliases pointing to paths that don't exist
 */

import { useEffect, useRef } from "react";
import { componentRegistry } from "@/lib/registry";

interface ValidateFsOptions {
  /** Map of virtualPath → content, from getAllFiles() */
  files: Map<string, string>;
  /** Current stream status — validation only runs when it transitions to idle */
  status: string;
  /** Called once per generation with the list of issues (if any) */
  onIssues: (issues: string[]) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract all JSX element names used in a source string (e.g. <Button …/>) */
function extractJsxElements(source: string): Set<string> {
  const elements = new Set<string>();
  // Match opening/self-closing JSX tags starting with uppercase
  const re = /<([A-Z][A-Za-z0-9]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    elements.add(m[1]);
  }
  return elements;
}

/** Extract all named imports from a source string */
function extractImportedNames(source: string): Set<string> {
  const names = new Set<string>();
  // import { A, B as C, D } from "..."
  const re = /import\s+\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    for (const part of m[1].split(",")) {
      const trimmed = part.trim();
      // Handle "X as Y" aliases — the local name is Y
      const asPart = trimmed.split(/\s+as\s+/);
      names.add(asPart[asPart.length - 1].trim());
    }
  }
  // import DefaultExport from "..."
  const defaultRe = /import\s+([A-Z][A-Za-z0-9]*)\s+from/g;
  while ((m = defaultRe.exec(source)) !== null) {
    names.add(m[1]);
  }
  return names;
}

/** Check @/ alias imports and verify target paths exist in the FS */
function checkAliasImports(
  source: string,
  allPaths: Set<string>
): string[] {
  const issues: string[] = [];
  const re = /from\s+["']@\/([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const relativePath = m[1];
    // Strip extension variants and check existence
    const candidates = [
      `/${relativePath}`,
      `/${relativePath}.tsx`,
      `/${relativePath}.ts`,
      `/${relativePath}.jsx`,
      `/${relativePath}.js`,
      `/${relativePath}/index.tsx`,
      `/${relativePath}/index.ts`,
    ];
    const exists = candidates.some((c) => allPaths.has(c));
    if (!exists) {
      // Only flag if not a known Shadcn ui path or registry block path
      const isShadcnUi = relativePath.startsWith("components/ui/");
      const isBlock = relativePath.startsWith("components/blocks/");
      if (!isShadcnUi && !isBlock) {
        issues.push(`Missing module: "@/${relativePath}" (referenced in import but not found in virtual FS)`);
      }
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useValidateFs({ files, status, onIssues }: ValidateFsOptions) {
  const prevStatusRef = useRef<string>(status);
  const onIssuesRef = useRef(onIssues);
  onIssuesRef.current = onIssues;

  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = status;

    // Only validate when stream just finished
    const justFinished =
      (prevStatus === "streaming" || prevStatus === "submitted") &&
      status === "idle";

    if (!justFinished) return;
    if (files.size === 0) return;

    const issues: string[] = [];
    const allPaths = new Set(files.keys());

    // Check 1: Missing entry point
    if (!allPaths.has("/App.tsx") && !allPaths.has("/App.jsx")) {
      issues.push("No entry point found — expected /App.tsx or /App.jsx.");
    }

    // Check 2: Per-file analysis
    const registryNames = new Set(Object.keys(componentRegistry));
    // React built-ins and HTML elements to ignore
    const builtIns = new Set([
      "React", "Fragment", "Suspense", "StrictMode",
      "Component", "PureComponent", "ErrorBoundary",
    ]);

    for (const [path, content] of files) {
      if (!path.endsWith(".tsx") && !path.endsWith(".jsx") && !path.endsWith(".ts") && !path.endsWith(".js")) {
        continue;
      }

      const imported = extractImportedNames(content);
      const usedElements = extractJsxElements(content);

      // Check 2a: Used JSX elements that are not imported
      for (const el of usedElements) {
        if (!imported.has(el) && !builtIns.has(el)) {
          issues.push(`${path}: <${el}> is used but not imported.`);
        }
      }

      // Check 2b: Registry components used without proper importPath
      for (const el of usedElements) {
        if (registryNames.has(el) && imported.has(el)) {
          const entry = componentRegistry[el];
          if (
            entry &&
            !content.includes(entry.importPath) &&
            !content.includes(`from "@/components/ui`) &&
            !content.includes(`from "@/components/blocks`)
          ) {
            issues.push(
              `${path}: <${el}> is imported but not from the expected path "${entry.importPath}".`
            );
          }
        }
      }

      // Check 2c: @/ alias imports pointing to non-existent files
      const aliasIssues = checkAliasImports(content, allPaths);
      issues.push(...aliasIssues.map((i) => `${path}: ${i}`));
    }

    if (issues.length > 0) {
      onIssuesRef.current(issues);
    }
  }, [status, files]);
}
