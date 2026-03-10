import { z } from "zod";
import { componentRegistry } from "@/lib/registry";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const InsertRegistryComponentParameters = z.object({
  name: z
    .string()
    .describe(
      "Registry component name exactly as it appears in the registry (e.g. 'Button', 'Card', 'PricingCard')."
    ),
  props: z
    .record(z.unknown())
    .default({})
    .describe(
      "Props to pass to the component as key-value pairs. Only include props listed in the registry entry. Required props must be present."
    ),
  targetFile: z
    .string()
    .optional()
    .describe(
      "Virtual FS path of the file to add the import statement to. Defaults to /App.tsx if omitted."
    ),
  alias: z
    .string()
    .optional()
    .describe(
      "Optional local alias for the import (e.g. alias='MyButton' → import { Button as MyButton })."
    ),
  insertPosition: z
    .enum(["append", "replace", "child-of"])
    .or(z.string())
    .optional()
    .describe(
      "Hint for where to insert the JSX in the target file: 'append' (end of return), " +
        "'replace' (swap an existing element), 'child-of' (nest inside a parent), " +
        "or a CSS/JSX selector string. Claude uses this with str_replace_editor."
    ),
});

export type InsertRegistryComponentInput = z.infer<
  typeof InsertRegistryComponentParameters
>;

// ---------------------------------------------------------------------------
// Return shape
// ---------------------------------------------------------------------------

interface ToolSuccess {
  importLine: string;
  jsxSnippet: string;
  targetFile: string;
  insertPosition: string;
  exampleUsage: string;
  warnings?: string[];
  instructions: string;
}

interface ToolError {
  error: string;
  available?: string;
  hint?: string;
  missingRequired?: string[];
  allProps?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// JSX prop serialiser
// ---------------------------------------------------------------------------

function serializeProps(props: Record<string, unknown>): string {
  return Object.entries(props)
    .map(([k, v]) => {
      if (v === true) return k;
      if (v === false) return `${k}={false}`;
      if (typeof v === "string") return `${k}="${v}"`;
      if (typeof v === "number") return `${k}={${v}}`;
      if (v === null || v === undefined) return "";
      // Arrays / objects: serialize as JSX expression
      return `${k}={${JSON.stringify(v)}}`;
    })
    .filter(Boolean)
    .join(" ");
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function buildInsertRegistryComponentTool() {
  return {
    parameters: InsertRegistryComponentParameters,
    execute: async ({
      name,
      props,
      targetFile,
      alias,
      insertPosition,
    }: InsertRegistryComponentInput): Promise<string> => {
      // ── 1. Registry lookup ───────────────────────────────────────────────
      const entry = componentRegistry[name];
      if (!entry) {
        const available = Object.keys(componentRegistry).sort().join(", ");
        const result: ToolError = {
          error: `"${name}" is not in the component registry.`,
          available,
          hint: "Call insert_registry_component with one of the available component names.",
        };
        return JSON.stringify(result);
      }

      // ── 2. Required-prop validation (hard error) ─────────────────────────
      const missingRequired: string[] = [];
      for (const [propName, propDef] of Object.entries(entry.props)) {
        if (propDef.required && !(propName in props)) {
          missingRequired.push(propName);
        }
      }
      if (missingRequired.length > 0) {
        const result: ToolError = {
          error: `Missing required props for ${name}: ${missingRequired.join(", ")}.`,
          missingRequired,
          allProps: entry.props,
          hint: `Supply all required props before calling insert_registry_component again.`,
        };
        return JSON.stringify(result);
      }

      // ── 3. Unknown/extra prop warnings (non-fatal) ───────────────────────
      const knownProps = new Set(Object.keys(entry.props));
      const unknownProps = Object.keys(props).filter((k) => !knownProps.has(k));
      const warnings: string[] = [];
      if (unknownProps.length > 0) {
        warnings.push(
          `Unknown props passed (not in registry): ${unknownProps.join(", ")}. ` +
            `They will be included in the JSX but may cause TypeScript errors.`
        );
      }

      // ── 4. Prop type hint warnings ───────────────────────────────────────
      for (const [k, v] of Object.entries(props)) {
        const def = entry.props[k];
        if (!def) continue;
        // Simple string-vs-non-string heuristic
        if (def.type === "boolean" && typeof v !== "boolean") {
          warnings.push(`Prop "${k}" expects boolean but received ${typeof v}.`);
        }
        if (def.type === "number" && typeof v !== "number") {
          warnings.push(`Prop "${k}" expects number but received ${typeof v}.`);
        }
      }

      // ── 5. Generate import line ──────────────────────────────────────────
      const importedName = alias ? `${name} as ${alias}` : name;
      const importLine = `import { ${importedName} } from "${entry.importPath}";`;

      // ── 6. Generate JSX snippet ──────────────────────────────────────────
      const componentName = alias ?? name;
      const propStr = serializeProps(props as Record<string, unknown>);
      const jsxSnippet = propStr
        ? `<${componentName} ${propStr} />`
        : `<${componentName} />`;

      // ── 7. Return success payload ────────────────────────────────────────
      const resolvedInsertPosition = insertPosition ?? "append";
      const result: ToolSuccess = {
        importLine,
        jsxSnippet,
        targetFile: targetFile ?? "/App.tsx",
        insertPosition: resolvedInsertPosition,
        exampleUsage: entry.exampleUsage,
        ...(warnings.length > 0 ? { warnings } : {}),
        instructions:
          `Use str_replace_editor to: ` +
          `(a) add importLine after the last existing import in "${targetFile ?? "/App.tsx"}", ` +
          `(b) insert jsxSnippet at position "${resolvedInsertPosition}" in the JSX tree. ` +
          `If insertPosition is 'append', place after the last JSX child in the return statement. ` +
          `If 'replace', swap the nearest matching element. ` +
          `If 'child-of', nest inside the first matching parent element.`,
      };
      return JSON.stringify(result);
    },
  };
}
