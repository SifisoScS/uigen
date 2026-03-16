"use client";

import { useEffect, useState } from "react";
import { Shield, Loader2 } from "lucide-react";
import { getGovernanceEvents } from "@/actions/get-governance-events";
import { ScrollArea } from "@/components/ui/scroll-area";

interface GovernanceEvent {
  id: string;
  type: string;
  actor: string | null;
  details: unknown;
  timestamp: Date;
}

/** Event types that carry a Sovereign Gate result in their details. */
const GATE_AWARE_EVENTS = new Set([
  "ARTIFACT_PUBLISHED",
  "ARTIFACT_VARIANT_APPROVED",
  "ARTIFACT_VARIANT_REJECTED",
  "ARTIFACT_VARIANT_PUBLISHED",
]);

const BYPASSED_LOG_ID = "0".repeat(64);

interface GateDetails {
  ubuntuScore?: number;
  gateLogEntryId?: string;
  branchName?: string;
  policyType?: string;
}

function UbuntuScoreBadge({ score, bypassed }: { score: number; bypassed: boolean }) {
  if (bypassed) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono bg-neutral-800 text-neutral-500 border border-neutral-700">
        U —
      </span>
    );
  }

  const pct = Math.round(score * 100);
  const color =
    score >= 0.75 ? "text-emerald-400 border-emerald-800 bg-emerald-950" :
    score >= 0.65 ? "text-amber-400 border-amber-800 bg-amber-950" :
                   "text-red-400 border-red-800 bg-red-950";

  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono border ${color}`}
      title={`Ubuntu alignment score: ${score.toFixed(3)}`}
    >
      U {pct}
    </span>
  );
}

function relativeTime(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}

function eventLabel(type: string): string {
  switch (type) {
    case "BRANCH_POLICY_SET":          return "Policy set";
    case "BRANCH_POLICY_CHANGED":      return "Policy changed";
    case "ARTIFACT_PUBLISHED":         return "Published";
    case "RELEASE_TAG_CREATED":        return "Release created";
    case "ARTIFACT_RELATION_CREATED":        return "Relation created";
    case "ARTIFACT_INTROSPECTION_GENERATED": return "Introspection generated";
    case "ARTIFACT_CRITIQUE_CREATED":        return "Critique created";
    case "ARTIFACT_VARIANT_CREATED":         return "Variant created";
    case "ARTIFACT_VARIANT_APPROVED":        return "Variant approved";
    case "ARTIFACT_VARIANT_REJECTED":        return "Variant rejected";
    case "ARTIFACT_VARIANT_MERGED":          return "Variant merged";
    case "ARTIFACT_VARIANT_CONFLICT_DETECTED": return "Conflict detected";
    case "ARTIFACT_VARIANT_CONFLICT_RESOLVED": return "Conflict resolved";
    case "ARTIFACT_CRITIQUE_MERGED":           return "Critique merged";
    case "ARTIFACT_VARIANT_MUTATED":           return "Suggestion applied";
    case "ARTIFACT_VARIANT_PUBLISHED":         return "Next generation published";
    case "AGENT_REPUTATION_UPDATED":           return "Reputation updated";
    case "ARTIFACT_SUGGESTIONS_SCORED":        return "Suggestions scored";
    case "EVALUATION_RUN_COMPLETED":           return "Evaluation completed";
    case "REGRESSION_DETECTED":               return "Regression detected";
    case "WORKFLOW_STEP_STARTED":             return "Step started";
    case "WORKFLOW_STEP_COMPLETED":           return "Step completed";
    case "WORKFLOW_STEP_FAILED":              return "Step failed";
    case "WORKFLOW_RUN_COMPLETED":            return "Workflow completed";
    case "DESCENDANT_METRICS_AGGREGATED":    return "Descendants aggregated";
    case "AGENT_DEMOTED":                    return "Agent demoted";
    case "AGENT_SPECIALIZATION_ANALYZED":    return "Specialization analyzed";
    case "AGENT_ROLE_ASSIGNED":              return "Role assigned";
    case "ARTIFACT_EMBEDDING_GENERATED":     return "Embedding generated";
    case "EXTERNAL_ARTIFACT_LINKED":         return "External link created";
    case "EXTERNAL_LINEAGE_SYNCED":          return "External lineage synced";
    case "SEMANTIC_TRANSFORM_RECORDED":      return "Transform recorded";
    default:                                 return type;
  }
}

function eventAccent(type: string): string {
  switch (type) {
    case "BRANCH_POLICY_SET":          return "text-blue-400";
    case "BRANCH_POLICY_CHANGED":      return "text-amber-400";
    case "ARTIFACT_PUBLISHED":         return "text-emerald-400";
    case "RELEASE_TAG_CREATED":        return "text-purple-400";
    case "ARTIFACT_RELATION_CREATED":        return "text-amber-300";
    case "ARTIFACT_INTROSPECTION_GENERATED": return "text-violet-400";
    case "ARTIFACT_CRITIQUE_CREATED":        return "text-orange-400";
    case "ARTIFACT_VARIANT_CREATED":         return "text-neutral-400";
    case "ARTIFACT_VARIANT_APPROVED":        return "text-emerald-400";
    case "ARTIFACT_VARIANT_REJECTED":        return "text-red-400";
    case "ARTIFACT_VARIANT_MERGED":          return "text-emerald-300";
    case "ARTIFACT_VARIANT_CONFLICT_DETECTED": return "text-amber-400";
    case "ARTIFACT_VARIANT_CONFLICT_RESOLVED": return "text-emerald-400";
    case "ARTIFACT_CRITIQUE_MERGED":           return "text-indigo-400";
    case "ARTIFACT_VARIANT_MUTATED":           return "text-violet-400";
    case "ARTIFACT_VARIANT_PUBLISHED":         return "text-indigo-400";
    case "AGENT_REPUTATION_UPDATED":           return "text-sky-400";
    case "ARTIFACT_SUGGESTIONS_SCORED":        return "text-teal-400";
    case "EVALUATION_RUN_COMPLETED":           return "text-cyan-400";
    case "REGRESSION_DETECTED":               return "text-red-500";
    case "WORKFLOW_STEP_STARTED":             return "text-neutral-400";
    case "WORKFLOW_STEP_COMPLETED":           return "text-emerald-400";
    case "WORKFLOW_STEP_FAILED":              return "text-red-400";
    case "WORKFLOW_RUN_COMPLETED":            return "text-purple-400";
    case "DESCENDANT_METRICS_AGGREGATED":    return "text-teal-300";
    case "AGENT_DEMOTED":                    return "text-red-600";
    case "AGENT_SPECIALIZATION_ANALYZED":    return "text-sky-300";
    case "AGENT_ROLE_ASSIGNED":              return "text-violet-400";
    case "ARTIFACT_EMBEDDING_GENERATED":     return "text-fuchsia-400";
    case "EXTERNAL_ARTIFACT_LINKED":         return "text-cyan-300";
    case "EXTERNAL_LINEAGE_SYNCED":          return "text-cyan-500";
    case "SEMANTIC_TRANSFORM_RECORDED":      return "text-amber-300";
    default:                                 return "text-neutral-400";
  }
}

export function GovernanceLog({ projectId }: { projectId: string }) {
  const [events, setEvents] = useState<GovernanceEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getGovernanceEvents(projectId)
      .then(setEvents)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-neutral-600" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="px-3 py-6 text-center">
        <Shield className="h-5 w-5 text-neutral-700 mx-auto mb-2" />
        <p className="text-[11px] text-neutral-600 leading-relaxed">
          No governance events yet. Branch policies are recorded automatically
          on first mutation.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="px-2 py-1 space-y-0.5">
        {events.map((evt) => {
          const details = evt.details as GateDetails | null;
          const isGateAware = GATE_AWARE_EVENTS.has(evt.type);
          const ubuntuScore = details?.ubuntuScore;
          const gateLogEntryId = details?.gateLogEntryId;
          const bypassed = gateLogEntryId === BYPASSED_LOG_ID;

          return (
            <div
              key={evt.id}
              className="px-2 py-2 rounded-md hover:bg-[#1a1a1a] transition-colors"
            >
              <div className="flex items-start justify-between gap-1 mb-0.5">
                <span
                  className={`text-[11px] font-medium ${eventAccent(evt.type)}`}
                >
                  {eventLabel(evt.type)}
                </span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {isGateAware && ubuntuScore !== undefined && (
                    <UbuntuScoreBadge score={ubuntuScore} bypassed={bypassed} />
                  )}
                  <span className="text-[10px] text-neutral-600">
                    {relativeTime(evt.timestamp)}
                  </span>
                </div>
              </div>

              {details?.branchName && (
                <p className="text-[10px] text-neutral-500 font-mono truncate">
                  {details.branchName}
                  {details.policyType && (
                    <span className="ml-1.5 font-sans text-neutral-600">
                      → {details.policyType}
                    </span>
                  )}
                </p>
              )}

              {isGateAware && gateLogEntryId && !bypassed && (
                <p className="text-[9px] text-neutral-700 font-mono mt-0.5 truncate"
                   title={`Gate log entry: ${gateLogEntryId}`}>
                  gate: {gateLogEntryId.slice(0, 16)}…
                </p>
              )}

              {evt.actor && (
                <p className="text-[9px] text-neutral-700 mt-0.5">
                  by {evt.actor}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
