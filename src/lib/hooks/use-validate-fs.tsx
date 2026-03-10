"use client";

/**
 * useValidateFs
 *
 * Runs lightweight static analysis on the virtual FS after each generation
 * stream completes. Calls `onIssues` with a structured list if problems are found
 * so the chat context can surface a self-correction prompt to Claude.
 *
 * Checks performed:
 *  1. Missing /App.tsx or /App.jsx entry point
 *  2. JSX elements used without a corresponding import (uppercase heuristic)
 *  3. Broken @/* alias imports (path not found in virtual FS)
 *  4. Missing "use client" directive in files that use React hooks
 *  5. Common Tailwind class typos (via curated regex list)
 *  6. Registry components imported from wrong paths
 *
 * Runs ONLY on status transition: (streaming | submitted) → idle.
 * Uses a ref-based guard to prevent repeated triggers on the same generation.
 */

import { useEffect, useRef } from "react";
import { componentRegistry } from "@/lib/registry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ValidateFsOptions {
  files: Map<string, string>;
  status: string;
  onIssues: (issues: string[]) => void;
}

// ---------------------------------------------------------------------------
// Tailwind typo patterns  (pattern → suggested correction)
// ---------------------------------------------------------------------------

const TAILWIND_TYPOS: Array<[RegExp, string]> = [
  [/\bbg-primr/g, "bg-primary"],
  [/\btext-primr/g, "text-primary"],
  [/\bfont-bol\b/g, "font-bold"],
  [/\bjustify-beetween\b/g, "justify-between"],
  [/\bpadding-/g, "p-{n} (use Tailwind shorthand)"],
  [/\bmargin-/g, "m-{n} (use Tailwind shorthand)"],
  [/\bhover-:/g, "hover:"],
  [/\bfocus-:/g, "focus:"],
];

// ---------------------------------------------------------------------------
// React hook names that imply "use client"
// ---------------------------------------------------------------------------

const CLIENT_HOOKS = new Set([
  "useState",
  "useEffect",
  "useRef",
  "useCallback",
  "useMemo",
  "useReducer",
  "useContext",
  "useLayoutEffect",
  "useImperativeHandle",
  "useId",
  "useDeferredValue",
  "useTransition",
]);

// React built-ins that don't need an explicit import in JSX
const BUILT_INS = new Set([
  "React",
  "Fragment",
  "Suspense",
  "StrictMode",
  "Component",
  "PureComponent",
  "ErrorBoundary",
  "Children",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractJsxElements(source: string): Set<string> {
  const elements = new Set<string>();
  const re = /<([A-Z][A-Za-z0-9.]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    // Handle namespaced: Sheet.Content → Sheet
    elements.add(m[1].split(".")[0]);
  }
  return elements;
}

function extractImportedNames(source: string): Set<string> {
  const names = new Set<string>();
  const namedRe = /import\s*\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = namedRe.exec(source)) !== null) {
    for (const part of m[1].split(",")) {
      const trimmed = part.trim();
      const asPart = trimmed.split(/\s+as\s+/);
      const localName = asPart[asPart.length - 1].trim();
      if (localName) names.add(localName);
    }
  }
  const defaultRe = /import\s+([A-Z][A-Za-z0-9]*)\s+from/g;
  while ((m = defaultRe.exec(source)) !== null) {
    names.add(m[1]);
  }
  return names;
}

function checkAliasImports(source: string, allPaths: Set<string>): string[] {
  const issues: string[] = [];
  const re = /from\s+["']@\/([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const rel = m[1];
    // Known safe prefixes — Shadcn ui, blocks, and app-level lib modules
    if (
      rel.startsWith("components/ui/") ||
      rel.startsWith("components/blocks/") ||
      rel.startsWith("lib/") ||
      rel.startsWith("hooks/")
    ) {
      continue;
    }
    const candidates = [
      `/${rel}`,
      `/${rel}.tsx`,
      `/${rel}.ts`,
      `/${rel}.jsx`,
      `/${rel}.js`,
      `/${rel}/index.tsx`,
      `/${rel}/index.ts`,
    ];
    if (!candidates.some((c) => allPaths.has(c))) {
      issues.push(
        `Broken alias import "@/${rel}" — path not found in virtual FS.`
      );
    }
  }
  return issues;
}

function checkMissingUseClient(path: string, source: string): string | null {
  const hasDirective =
    source.trimStart().startsWith('"use client"') ||
    source.trimStart().startsWith("'use client'");
  if (hasDirective) return null;

  const usedHooks = [...CLIENT_HOOKS].filter((h) =>
    new RegExp(`\\b${h}\\s*\\(`).test(source)
  );
  if (usedHooks.length === 0) return null;

  return (
    `${path}: uses React hook(s) [${usedHooks.join(", ")}] ` +
    `but is missing "use client" directive at the top of the file.`
  );
}

function checkTailwindTypos(path: string, source: string): string[] {
  const issues: string[] = [];
  for (const [pattern, suggestion] of TAILWIND_TYPOS) {
    if (pattern.test(source)) {
      issues.push(
        `${path}: possible Tailwind typo (matches /${pattern.source}/) — did you mean "${suggestion}"?`
      );
    }
    pattern.lastIndex = 0; // reset global RegExp state
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

  // Track last-checked file-count to guard against re-triggers on the same
  // generation (e.g. React Strict Mode double-effects in development).
  const lastCheckedSizeRef = useRef<number>(-1);

  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = status;

    // Only run when the stream just transitioned to idle
    const justFinished =
      (prevStatus === "streaming" || prevStatus === "submitted") &&
      status === "idle";

    if (!justFinished) return;
    if (files.size === 0) return;
    if (files.size === lastCheckedSizeRef.current) return;
    lastCheckedSizeRef.current = files.size;

    const issues: string[] = [];
    const allPaths = new Set(files.keys());
    const registryNames = new Set(Object.keys(componentRegistry));

    // ── Check 1: Missing entry point ──────────────────────────────────────
    if (!allPaths.has("/App.tsx") && !allPaths.has("/App.jsx")) {
      issues.push(
        "No entry point: expected /App.tsx or /App.jsx at the virtual FS root."
      );
    }

    // ── Per-file checks ───────────────────────────────────────────────────
    for (const [path, content] of files) {
      const isScript =
        path.endsWith(".tsx") ||
        path.endsWith(".jsx") ||
        path.endsWith(".ts") ||
        path.endsWith(".js");
      if (!isScript) continue;

      const imported = extractImportedNames(content);
      const usedElements = extractJsxElements(content);

      // Check 2: Unimported JSX elements
      for (const el of usedElements) {
        if (!imported.has(el) && !BUILT_INS.has(el)) {
          issues.push(`${path}: <${el}> is used but not imported.`);
        }
      }

      // Check 3: Registry components imported from wrong path
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
              `${path}: <${el}> imported but not from expected path "${entry.importPath}".`
            );
          }
        }
      }

      // Check 4: Broken @/ alias imports
      for (const ai of checkAliasImports(content, allPaths)) {
        issues.push(`${path}: ${ai}`);
      }

      // Check 5: Missing "use client" directive
      const clientIssue = checkMissingUseClient(path, content);
      if (clientIssue) issues.push(clientIssue);

      // Check 6: Tailwind typos
      issues.push(...checkTailwindTypos(path, content));
    }

    if (issues.length > 0) {
      onIssuesRef.current(issues);
    }
  }, [status, files]);
}
