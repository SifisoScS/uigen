"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ManifestViewer({ manifest }: { manifest: unknown }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-[#2a2a2a] rounded-lg overflow-hidden">
      <Button
        variant="ghost"
        className="w-full flex items-center justify-between px-4 py-3 h-auto rounded-none text-sm text-neutral-400 hover:text-neutral-200 hover:bg-[#1a1a1a]"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-medium">Manifest JSON</span>
        {open ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </Button>
      {open && (
        <pre className="bg-[#0d0d0d] p-4 text-xs text-neutral-300 overflow-x-auto max-h-96 overflow-y-auto leading-relaxed">
          {JSON.stringify(manifest, null, 2)}
        </pre>
      )}
    </div>
  );
}
