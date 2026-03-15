import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Bot,
  Calendar,
  ArrowLeft,
  Package,
  AlertCircle,
  Lightbulb,
  Shield,
} from "lucide-react";
import { getAgentInvocationDetail } from "@/actions/get-agent-invocation-detail";

export const dynamic = "force-dynamic";

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
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

export default async function AgentInvocationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getAgentInvocationDetail(id);
  if (!data) notFound();

  const { invocation, artifacts, govEvents } = data;
  const critique = invocation.critiqueJson;
  const suggestions = Array.isArray(critique?.suggestions) ? (critique!.suggestions as string[]) : [];
  const issues      = Array.isArray(critique?.issues)      ? (critique!.issues      as string[]) : [];

  const backHref = artifacts.length > 0 ? `/lineage/${artifacts[0].id}` : "/";

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-neutral-100">
      {/* Header */}
      <header className="border-b border-[#1f1f1f] bg-[#111111]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-2 text-sm text-neutral-500">
          <Bot className="h-4 w-4 text-orange-500" />
          <span>AgentInvocation</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        {/* Title block */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-neutral-50">
            Critique by {invocation.agentName}
          </h1>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <span className="flex items-center gap-1.5 text-sm text-neutral-500">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(invocation.createdAt)}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-orange-950/40 border border-orange-800/40 text-orange-400 text-xs font-medium">
              {invocation.agentName}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] text-neutral-500 text-xs font-mono">
              EVALUATED_BY
            </span>
          </div>
          <p className="text-xs text-neutral-500 italic leading-relaxed pt-1">
            &ldquo;{invocation.prompt}&rdquo;
          </p>
        </div>

        {/* Critique output */}
        {(suggestions.length > 0 || issues.length > 0) && (
          <section aria-label="Critique" data-testid="critique-section">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3 flex items-center gap-1.5">
              <Bot className="h-3.5 w-3.5 text-orange-500" />
              Critique
            </h2>
            <div className="space-y-4">
              {suggestions.length > 0 && (
                <div className="rounded-lg border border-[#2a2a2a] bg-[#111111] px-4 py-3 space-y-2">
                  <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-medium flex items-center gap-1.5">
                    <Lightbulb className="h-3 w-3 text-orange-400" />
                    Suggestions
                  </p>
                  <ul className="space-y-1.5">
                    {suggestions.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-neutral-300">
                        <span className="text-orange-500 mt-0.5 flex-shrink-0">·</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {issues.length > 0 && (
                <div className="rounded-lg border border-[#2a2a2a] bg-[#111111] px-4 py-3 space-y-2">
                  <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-medium flex items-center gap-1.5">
                    <AlertCircle className="h-3 w-3 text-red-400" />
                    Issues
                  </p>
                  <ul className="space-y-1.5">
                    {issues.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-neutral-300">
                        <span className="text-red-500 mt-0.5 flex-shrink-0">·</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Related UI Artifacts */}
        <section aria-label="Related UI Artifacts">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3 flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5" />
            Related UI Artifacts
            <span className="ml-1 text-neutral-700 text-[10px] normal-case font-normal">
              ({artifacts.length})
            </span>
          </h2>

          {artifacts.length === 0 ? (
            <p className="text-xs text-neutral-600">
              No artifacts linked to this invocation yet.
            </p>
          ) : (
            <div className="space-y-2">
              {artifacts.map((a) => {
                const manifest = a.manifest as Record<string, unknown>;
                const policy = (manifest?.governancePolicy as Record<string, unknown>)
                  ?.policyType as string | undefined;

                return (
                  <Link
                    key={a.id}
                    href={`/share/${a.id}`}
                    className="flex items-center justify-between px-4 py-3 rounded-lg border border-[#2a2a2a] bg-[#111111] hover:border-[#3a3a3a] hover:bg-[#181818] transition-colors group"
                    data-testid={`artifact-link-${a.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Package className="h-4 w-4 text-neutral-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-neutral-200 truncate group-hover:text-neutral-50 transition-colors">
                          {a.name}
                        </p>
                        <p className="text-[10px] text-neutral-600 mt-0.5">
                          v{a.version} · {a.branchName}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {policy && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/40 border border-emerald-800/40 text-emerald-400">
                          {policy}
                        </span>
                      )}
                      <span className="text-[10px] text-orange-600/80 font-mono">
                        {a.relationType}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Governance Events */}
        {govEvents.length > 0 && (
          <section aria-label="Governance Events">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3 flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Governance Events
            </h2>
            <div className="space-y-1">
              {govEvents.map((evt) => {
                const details = evt.details as Record<string, unknown> | null;
                return (
                  <div
                    key={evt.id}
                    className="px-3 py-2 rounded-md bg-[#111111] border border-[#1f1f1f]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[11px] font-medium text-orange-400">
                        Critique created
                      </span>
                      <span className="text-[10px] text-neutral-600 flex-shrink-0">
                        {relativeTime(evt.timestamp)}
                      </span>
                    </div>
                    {typeof details?.childId === "string" && (
                      <p className="text-[10px] text-neutral-500 font-mono mt-0.5 truncate">
                        artifact:{" "}
                        <Link
                          href={`/share/${details.childId}`}
                          className="hover:text-neutral-300 transition-colors"
                        >
                          {details.childId}
                        </Link>
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
          </section>
        )}

        {/* Back link */}
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-xs text-neutral-500 hover:text-neutral-300 transition-colors group"
        >
          <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
          Back to lineage
        </Link>
      </main>
    </div>
  );
}
