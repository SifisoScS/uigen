import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Package, Tag, GitBranch, Calendar, User, GitFork, Workflow, Database, Layers, GitMerge } from "lucide-react";
import { RemixButton } from "./RemixButton";
import { ManifestViewer } from "./ManifestViewer";
import { AncestryChain } from "@/components/AncestryChain";
import { ArtifactIntrospection } from "./ArtifactIntrospection";
import { VariantApprovalCard } from "./VariantApprovalCard";
import { MultiAgentCritiquePanel } from "./MultiAgentCritiquePanel";
import { getArtifactLineage } from "@/actions/get-artifact-lineage";
import { getArtifactLineageDeep } from "@/actions/get-artifact-lineage";

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

export default async function SharePage({
  params,
}: {
  params: Promise<{ artifactId: string }>;
}) {
  const { artifactId } = await params;

  const artifact = await prisma.publicArtifact.findUnique({
    where: { id: artifactId },
    select: {
      id: true,
      name: true,
      description: true,
      version: true,
      branchName: true,
      manifest: true,
      previewImage: true,
      authorId: true,
      createdAt: true,
      semanticSummary: true,
      componentTree: true,
      styleSignature: true,
    },
  });

  if (!artifact) notFound();

  const [manifest, lineage, deep] = await Promise.all([
    Promise.resolve(artifact.manifest as Record<string, unknown>),
    getArtifactLineage(artifactId).catch(() => ({ parent: null, children: [] as never[] })),
    getArtifactLineageDeep(artifactId, 1).catch(() => null),
  ]);
  const crossParents = deep?.crossParents ?? [];
  const variants = deep?.variants ?? [];
  const mergedVariant = variants.find((v) => v.isMerged) ?? null;
  const tags = Array.isArray(manifest.registryTags)
    ? (manifest.registryTags as string[])
    : [];

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-neutral-100">
      {/* Header bar */}
      <header className="border-b border-[#1f1f1f] bg-[#111111]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <Package className="h-4 w-4" />
            <span>UIGen Artifact</span>
          </div>
          <RemixButton artifactId={artifact.id} />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        {/* Title block */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-neutral-50">{artifact.name}</h1>
          {artifact.description && (
            <p className="text-neutral-400 text-base leading-relaxed">
              {artifact.description}
            </p>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-4 pt-1 text-sm text-neutral-500">
            <span className="flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5" />
              v{artifact.version}
            </span>
            <span className="flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5" />
              {artifact.branchName}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(artifact.createdAt)}
            </span>
            {artifact.authorId && (
              <span className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                {artifact.authorId}
              </span>
            )}
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] text-xs text-neutral-400"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Preview image */}
        {artifact.previewImage && (
          <div className="rounded-xl overflow-hidden border border-[#2a2a2a] bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={artifact.previewImage}
              alt={`Preview of ${artifact.name}`}
              className="w-full h-auto max-h-[480px] object-contain"
            />
          </div>
        )}

        {/* Governance badge */}
        <div className="flex items-center gap-3 p-4 rounded-lg bg-[#111111] border border-[#2a2a2a]">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-neutral-300">
              Governance Policy
            </span>
            <span className="text-xs text-neutral-500">
              {(manifest.governancePolicy as Record<string, unknown>)?.policyType as string ?? "HUMAN_ONLY"} — published from a governed release branch
            </span>
          </div>
          <span className="ml-auto px-2.5 py-1 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 text-xs font-medium">
            Verified
          </span>
        </div>

        {/* Manifest viewer */}
        <ManifestViewer manifest={artifact.manifest} />

        {/* Introspection */}
        <ArtifactIntrospection
          semanticSummary={artifact.semanticSummary}
          componentTree={artifact.componentTree as Record<string, unknown> | null}
          styleSignature={
            artifact.styleSignature as {
              colors?: string[];
              spacing?: string[];
              classes?: string[];
              usedComponents?: string[];
              propSummary?: Record<string, string[]>;
            } | null
          }
        />

        {/* Multi-agent critique & variant selection */}
        <MultiAgentCritiquePanel artifactId={artifactId} />

        {/* Ancestry chain */}
        <AncestryChain parent={lineage.parent} remixedInto={lineage.children} />

        {/* Cross-artifact parents (WorkflowRun / DatasetSnapshot) */}
        {crossParents.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
              Linked artifacts
            </p>
            <div className="flex flex-wrap gap-2">
              {crossParents.map((cp) => {
                const isDataset = cp.parentType === "DatasetSnapshot";
                const href = isDataset
                  ? `/dataset-snapshot/${cp.id}`
                  : `/workflow-run/${cp.id}`;
                return (
                  <a
                    key={cp.id}
                    href={href}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                      isDataset
                        ? "border-emerald-800/40 bg-emerald-950/30 text-emerald-400 hover:border-emerald-700/60 hover:bg-emerald-950/50"
                        : "border-amber-800/40 bg-amber-950/30 text-amber-400 hover:border-amber-700/60 hover:bg-amber-950/50"
                    }`}
                  >
                    {isDataset ? (
                      <Database className="h-3 w-3" />
                    ) : (
                      <Workflow className="h-3 w-3" />
                    )}
                    <span className="font-medium">{cp.parentName}</span>
                    <span
                      className={`text-[10px] ${isDataset ? "text-emerald-700" : "text-amber-700"}`}
                    >
                      {cp.relationType}
                    </span>
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* Merged variant banner */}
        {mergedVariant && (
          <div
            data-testid="merged-variant-banner"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-emerald-800/30 bg-emerald-950/10 text-xs text-emerald-400"
          >
            <GitMerge className="h-3.5 w-3.5 flex-shrink-0" />
            <span>
              Merged from variant:{" "}
              <a
                href={`/${mergedVariant.id}`}
                className="underline underline-offset-2 hover:text-emerald-300 transition-colors"
              >
                {mergedVariant.suggestion ?? mergedVariant.name}
              </a>
            </span>
          </div>
        )}

        {/* Variant Projects (auto-generated from critique suggestions) */}
        {variants.length > 0 && (
          <section aria-label="Variant Projects" data-testid="variants-section">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              Agent-generated variants
              <span className="ml-1 text-neutral-700 text-[10px] normal-case font-normal">
                ({variants.length})
              </span>
            </h2>
            <div className="space-y-2">
              {variants.map((v) => (
                <VariantApprovalCard
                  key={v.id}
                  variantId={v.id}
                  originalArtifactId={artifactId}
                  suggestion={v.suggestion}
                  variantName={v.name}
                  initialStatus={v.status}
                  initialIsMerged={v.isMerged}
                />
              ))}
            </div>
          </section>
        )}

        {/* Full lineage graph link */}
        <Link
          href={`/lineage/${artifact.id}`}
          className="flex items-center gap-2 text-xs text-neutral-500 hover:text-neutral-300 transition-colors group w-fit"
        >
          <GitFork className="h-3.5 w-3.5 group-hover:text-blue-400 transition-colors" />
          View full lineage graph
        </Link>

        {/* Remix CTA */}
        <div className="rounded-xl border border-[#2a2a2a] bg-[#111111] p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="font-medium text-neutral-200 text-sm">
              Want to build on this?
            </p>
            <p className="text-xs text-neutral-500 mt-0.5">
              Remix creates your own editable copy with all files included.
            </p>
          </div>
          <RemixButton artifactId={artifact.id} />
        </div>
      </main>
    </div>
  );
}
