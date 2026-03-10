"use client";

import { useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFileSystem } from "@/lib/contexts/file-system-context";

// ---------------------------------------------------------------------------
// Boilerplate injected for "Export entire project"
// ---------------------------------------------------------------------------

const BOILERPLATE: Record<string, string> = {
  "/package.json": JSON.stringify(
    {
      name: "uigen-export",
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        dev: "next dev --turbopack",
        build: "next build",
        start: "next start",
        lint: "next lint",
      },
      dependencies: {
        next: "15.3.3",
        react: "^19.0.0",
        "react-dom": "^19.0.0",
        typescript: "^5",
        tailwindcss: "^4",
        "@tailwindcss/postcss": "^4",
        "lucide-react": "^0.517.0",
        "class-variance-authority": "^0.7.1",
        clsx: "^2.1.1",
        "tailwind-merge": "^3.3.1",
      },
      devDependencies: {
        "@types/node": "^20",
        "@types/react": "^19",
        "@types/react-dom": "^19",
      },
    },
    null,
    2
  ),
  "/tsconfig.json": JSON.stringify(
    {
      compilerOptions: {
        target: "ES2017",
        lib: ["dom", "dom.iterable", "esnext"],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "preserve",
        incremental: true,
        plugins: [{ name: "next" }],
        paths: { "@/*": ["./src/*"] },
      },
      include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
      exclude: ["node_modules"],
    },
    null,
    2
  ),
  "/tailwind.config.ts": `import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
`,
  "/next.config.ts": `import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
`,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip the leading "/" and map virtual paths into a `src/` subtree for the
 * exported Next.js project, unless the path is already a root config file.
 */
function virtualPathToZipPath(virtualPath: string): string {
  const stripped = virtualPath.replace(/^\//, "");
  // Root-level config files stay at root; everything else goes under src/
  const rootConfigs = new Set([
    "package.json",
    "tsconfig.json",
    "tailwind.config.ts",
    "tailwind.config.js",
    "next.config.ts",
    "next.config.js",
    "postcss.config.js",
    "postcss.config.mjs",
    ".eslintrc.json",
    ".gitignore",
    "README.md",
  ]);
  return rootConfigs.has(stripped) ? stripped : `src/${stripped}`;
}

async function buildZip(
  files: Map<string, string>,
  includeBoilerplate: boolean
): Promise<Blob> {
  const zip = new JSZip();

  // User's virtual files
  for (const [virtualPath, content] of files) {
    const zipPath = virtualPathToZipPath(virtualPath);
    zip.file(zipPath, content);
  }

  // Boilerplate (only for full-project export, never overwrite user files)
  if (includeBoilerplate) {
    for (const [virtualPath, content] of Object.entries(BOILERPLATE)) {
      const zipPath = virtualPathToZipPath(virtualPath);
      // Don't overwrite if user already has a file at this path
      if (!zip.file(zipPath)) {
        zip.file(zipPath, content);
      }
    }
  }

  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

function sanitizeProjectName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "uigen-export";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ExportButtonProps {
  /** Optional project name used for the ZIP filename. */
  projectName?: string;
}

export function ExportButton({ projectName }: ExportButtonProps) {
  const { getAllFiles, selectedFile } = useFileSystem();
  const [loading, setLoading] = useState(false);

  const baseName = sanitizeProjectName(projectName ?? "uigen-export");

  async function handleExport(mode: "current" | "full") {
    const allFiles = getAllFiles();

    if (allFiles.size === 0) {
      toast.error("Nothing to export — the project has no files yet.");
      return;
    }

    if (mode === "current") {
      // Determine the "active" subset: selected file + any files that share
      // its top-level directory (e.g. everything under /components if the
      // selected file is /components/Button.tsx).
      const activeFile = selectedFile;
      if (!activeFile) {
        toast.error("No file is currently selected.");
        return;
      }

      const topDir = "/" + activeFile.split("/").filter(Boolean)[0];
      const subset = new Map<string, string>();

      for (const [path, content] of allFiles) {
        if (path === activeFile || path.startsWith(topDir + "/") || path === topDir) {
          subset.set(path, content);
        }
      }

      if (subset.size === 0) {
        toast.error("Could not determine the active file subset.");
        return;
      }

      setLoading(true);
      try {
        const blob = await buildZip(subset, false);
        const fileName = activeFile.split("/").filter(Boolean).pop() ?? "component";
        const zipName = `${sanitizeProjectName(fileName)}.zip`;
        saveAs(blob, zipName);
        toast.success(`Exported "${zipName}" (${subset.size} file${subset.size === 1 ? "" : "s"})`);
      } catch (err) {
        console.error("Export error", err);
        toast.error("Export failed. Please try again.");
      } finally {
        setLoading(false);
      }

      return;
    }

    // Full project export
    setLoading(true);
    try {
      const blob = await buildZip(allFiles, true);
      const zipName = `${baseName}.zip`;
      saveAs(blob, zipName);
      toast.success(
        `Exported "${zipName}" (${allFiles.size} file${allFiles.size === 1 ? "" : "s"} + boilerplate)`
      );
    } catch (err) {
      console.error("Export error", err);
      toast.error("Export failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-8 gap-2"
          disabled={loading}
          aria-label="Export project as ZIP"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => handleExport("current")}
          disabled={loading}
        >
          <Download className="h-4 w-4 mr-2" />
          Export current component only
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => handleExport("full")}
          disabled={loading}
        >
          <Download className="h-4 w-4 mr-2" />
          Export entire project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
