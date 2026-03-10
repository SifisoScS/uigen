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
      "Props to pass to the component as key-value pairs. Only include props listed in the registry entry."
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
});

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
      return `${k}={${JSON.stringify(v)}}`;
    })
    .filter(Boolean)
    .join(" ");
}

// ---------------------------------------------------------------------------
// Tool factory (server-side only — no FS mutation; returns code for Claude to
// insert via str_replace_editor)
// ---------------------------------------------------------------------------

export function buildInsertRegistryComponentTool() {
  return {
    parameters: InsertRegistryComponentParameters,
    execute: async ({
      name,
      props,
      targetFile,
      alias,
    }: z.infer<typeof InsertRegistryComponentParameters>): Promise<string> => {
      // 1. Registry lookup
      const entry = componentRegistry[name];
      if (!entry) {
        const available = Object.keys(componentRegistry).sort().join(", ");
        return JSON.stringify({
          error: `"${name}" is not in the component registry.`,
          available,
          hint: "Call insert_registry_component with one of the available component names.",
        });
      }

      // 2. Required-prop validation
      const missingRequired: string[] = [];
      for (const [propName, propDef] of Object.entries(entry.props)) {
        if (propDef.required && !(propName in props)) {
          missingRequired.push(propName);
        }
      }
      if (missingRequired.length > 0) {
        return JSON.stringify({
          error: `Missing required props for ${name}: ${missingRequired.join(", ")}.`,
          requiredProps: missingRequired,
          allProps: entry.props,
        });
      }

      // 3. Unknown-prop warning (non-fatal)
      const knownProps = new Set(Object.keys(entry.props));
      const unknownProps = Object.keys(props).filter((k) => !knownProps.has(k));
      const warning =
        unknownProps.length > 0
          ? `Warning: unknown props passed: ${unknownProps.join(", ")}. They may be ignored.`
          : undefined;

      // 4. Generate import line
      const importedName = alias ? `${name} as ${alias}` : name;
      const importLine = `import { ${importedName} } from "${entry.importPath}";`;

      // 5. Generate JSX snippet
      const componentName = alias ?? name;
      const propStr = serializeProps(props as Record<string, unknown>);
      const jsxSnippet = propStr
        ? `<${componentName} ${propStr} />`
        : `<${componentName} />`;

      // 6. Return generated code for Claude to insert via str_replace_editor
      return JSON.stringify({
        importLine,
        jsxSnippet,
        targetFile: targetFile ?? "/App.tsx",
        exampleUsage: entry.exampleUsage,
        ...(warning ? { warning } : {}),
        instructions:
          "Use str_replace_editor to (a) add importLine after the last existing import in targetFile, " +
          "and (b) insert jsxSnippet at the appropriate location in the JSX tree.",
      });
    },
  };
}
