"use client";

import { useState, useTransition } from "react";
import { CheckCircle, XCircle, Clock, GitMerge } from "lucide-react";
import { approveVariant } from "@/actions/approve-variant";
import { mergeVariant } from "@/actions/merge-variant";

interface Props {
  variantId: string;
  originalArtifactId: string;
  suggestion: string | null;
  variantName: string;
  initialStatus: string;
  initialIsMerged: boolean;
}

function StatusBadge({ status, isMerged }: { status: string; isMerged: boolean }) {
  if (isMerged) {
    return (
      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/40 border border-emerald-700/40 text-emerald-400 text-[10px] font-medium">
        <GitMerge className="h-2.5 w-2.5" />
        Merged
      </span>
    );
  }
  switch (status) {
    case "APPROVED":
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 text-[10px] font-medium">
          <CheckCircle className="h-2.5 w-2.5" />
          Approved
        </span>
      );
    case "REJECTED":
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-950/40 border border-red-800/40 text-red-400 text-[10px] font-medium">
          <XCircle className="h-2.5 w-2.5" />
          Rejected
        </span>
      );
    default:
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] text-neutral-500 text-[10px] font-medium">
          <Clock className="h-2.5 w-2.5" />
          Draft
        </span>
      );
  }
}

export function VariantApprovalCard({
  variantId,
  originalArtifactId,
  suggestion,
  variantName,
  initialStatus,
  initialIsMerged,
}: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [isMerged, setIsMerged] = useState(initialIsMerged);
  const [isPending, startTransition] = useTransition();

  function handleApprove(approved: boolean) {
    startTransition(async () => {
      try {
        const result = await approveVariant(variantId, approved);
        setStatus(result.status);
      } catch {
        // keep current status on error
      }
    });
  }

  function handleMerge() {
    startTransition(async () => {
      try {
        await mergeVariant({ originalArtifactId, variantProjectId: variantId });
        setIsMerged(true);
      } catch {
        // keep current state on error
      }
    });
  }

  return (
    <div
      data-testid={`variant-card-${variantId}`}
      className={[
        "rounded-lg border px-4 py-3 flex flex-col gap-2 transition-colors",
        isMerged
          ? "border-emerald-700/40 bg-emerald-950/10"
          : status === "APPROVED"
          ? "border-emerald-800/30 bg-emerald-950/10"
          : status === "REJECTED"
          ? "border-red-900/30 bg-[#0d0d0d] opacity-60"
          : "border-[#2a2a2a] bg-[#111111]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`text-xs leading-snug flex-1 min-w-0 ${status === "REJECTED" ? "line-through text-neutral-600" : isMerged ? "text-emerald-300/80" : "text-neutral-300"}`}>
          {suggestion ?? variantName}
        </p>
        <StatusBadge status={status} isMerged={isMerged} />
      </div>

      {status === "DRAFT" && !isMerged && (
        <div className="flex items-center gap-2 pt-1">
          <button
            disabled={isPending}
            onClick={() => handleApprove(true)}
            data-testid={`approve-btn-${variantId}`}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 hover:bg-emerald-900/40 hover:border-emerald-700/50 transition-colors disabled:opacity-50"
          >
            <CheckCircle className="h-2.5 w-2.5" />
            Approve
          </button>
          <button
            disabled={isPending}
            onClick={() => handleApprove(false)}
            data-testid={`reject-btn-${variantId}`}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium bg-red-950/30 border border-red-800/30 text-red-500 hover:bg-red-950/50 hover:border-red-700/50 transition-colors disabled:opacity-50"
          >
            <XCircle className="h-2.5 w-2.5" />
            Reject
          </button>
        </div>
      )}

      {status === "APPROVED" && !isMerged && (
        <button
          disabled={isPending}
          onClick={handleMerge}
          data-testid={`merge-btn-${variantId}`}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium bg-emerald-950/30 border border-emerald-800/30 text-emerald-500 hover:bg-emerald-900/40 hover:border-emerald-700/50 transition-colors disabled:opacity-50 w-fit"
        >
          <GitMerge className="h-2.5 w-2.5" />
          Merge into project
        </button>
      )}
    </div>
  );
}
