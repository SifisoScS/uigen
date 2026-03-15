"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export function JsonViewer({ data }: { data: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const keyCount = Object.keys(data).length;

  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#0c0c0c] overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-neutral-400 hover:text-neutral-200 hover:bg-[#181818] transition-colors"
        aria-expanded={open}
        aria-controls="json-viewer-content"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
        )}
        {open ? "Hide" : "Show"} input data
        <span className="ml-auto text-[10px] text-neutral-600 font-mono">
          {keyCount} {keyCount === 1 ? "key" : "keys"}
        </span>
      </button>
      {open && (
        <pre
          id="json-viewer-content"
          className="px-4 py-3 text-[11px] text-neutral-300 font-mono overflow-x-auto border-t border-[#1f1f1f] leading-relaxed whitespace-pre-wrap break-words"
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
