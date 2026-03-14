import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getArtifactLineageDeep } from "@/actions/get-artifact-lineage";
import { LineageGraph } from "@/components/lineage/LineageGraph";
import {
  ChevronRight,
  GitFork,
  Users,
  TrendingUp,
  AlertCircle,
} from "lucide-react";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ artifactId: string }>;
}

export default async function LineagePage({ params }: PageProps) {
  const { artifactId } = await params;

  const artifact = await prisma.publicArtifact.findUnique({
    where: { id: artifactId },
    select: {
      id: true,
      name: true,
      version: true,
      remixCount: true,
      description: true,
    },
  });

  if (!artifact) notFound();

  const lineage = await getArtifactLineageDeep(artifactId, 1).catch(() => null);

  if (!lineage) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-neutral-600 mx-auto" />
          <p className="text-sm text-neutral-500">
            Failed to load lineage data.
          </p>
          <Link
            href={`/share/${artifactId}`}
            className="text-xs text-blue-500 hover:text-blue-400 underline"
          >
            ← Back to artifact
          </Link>
        </div>
      </div>
    );
  }

  const ancestorCount = lineage.parents.length;
  const descendantCount = lineage.children.length;

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-neutral-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-[#1f1f1f] bg-[#111111] flex-shrink-0">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          {/* Breadcrumb */}
          <nav
            className="flex items-center gap-1.5 text-xs text-neutral-500 min-w-0"
            aria-label="Breadcrumb"
          >
            <Link href="/" className="hover:text-neutral-300 transition-colors flex-shrink-0">
              Home
            </Link>
            <ChevronRight className="h-3 w-3 flex-shrink-0" />
            <Link
              href="/registry"
              className="hover:text-neutral-300 transition-colors flex-shrink-0"
            >
              Registry
            </Link>
            <ChevronRight className="h-3 w-3 flex-shrink-0" />
            <Link
              href={`/share/${artifactId}`}
              className="hover:text-neutral-300 transition-colors truncate max-w-[160px]"
              title={artifact.name}
            >
              {artifact.name}
            </Link>
            <ChevronRight className="h-3 w-3 flex-shrink-0" />
            <span className="text-neutral-300 flex-shrink-0">Lineage</span>
          </nav>

          <Link
            href={`/share/${artifactId}`}
            className="flex-shrink-0 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            ← Back to artifact
          </Link>
        </div>
      </header>

      {/* Page title */}
      <div className="border-b border-[#1a1a1a] bg-[#0d0d0d] flex-shrink-0">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-neutral-50 flex items-center gap-2">
                <GitFork className="h-5 w-5 text-neutral-400" />
                Lineage Graph
              </h1>
              <p className="mt-1 text-sm text-neutral-500">
                Remix ancestry &amp; descendants for{" "}
                <span className="text-neutral-300 font-medium">
                  {artifact.name}
                </span>{" "}
                <span className="font-mono text-neutral-600 text-xs">
                  v{artifact.version}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-6 py-6 flex flex-col lg:flex-row gap-6 min-h-0">
        {/* Graph — takes available space */}
        <div className="flex-1 min-h-0 h-[560px] lg:h-auto">
          <LineageGraph initialData={lineage} currentId={artifactId} />
        </div>

        {/* Stats sidebar */}
        <aside className="lg:w-60 flex-shrink-0 space-y-3">
          <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
            Summary
          </h2>

          <StatCard
            icon={<Users className="h-4 w-4" />}
            label="Ancestors"
            value={ancestorCount}
            sub="at depth 1"
          />
          <StatCard
            icon={<GitFork className="h-4 w-4" />}
            label="Direct remixes"
            value={descendantCount}
            sub="immediate children"
          />
          <StatCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Total remixes"
            value={artifact.remixCount}
            sub="all time"
          />

          {lineage.depthReached && (
            <div className="rounded-lg border border-[#2a2a2a] bg-[#111111] px-3 py-3">
              <p className="text-[10px] text-neutral-500 leading-relaxed">
                Ancestry deeper than depth 1. Use the depth slider to explore
                further.
              </p>
            </div>
          )}

          <div className="pt-2 border-t border-[#1f1f1f] space-y-2">
            <p className="text-[10px] text-neutral-600 leading-relaxed">
              Click any node to open its artifact page. Use the depth slider to
              reveal deeper ancestry.
            </p>
            <Link
              href={`/share/${artifactId}`}
              className="block text-[10px] text-blue-500 hover:text-blue-400 transition-colors"
            >
              View artifact details →
            </Link>
            <Link
              href="/registry"
              className="block text-[10px] text-neutral-500 hover:text-neutral-400 transition-colors"
            >
              Browse registry →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#111111] px-3 py-3 flex items-center gap-3">
      <div className="text-neutral-600">{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-neutral-200">{value}</p>
        <p className="text-[10px] text-neutral-500 leading-none mt-0.5">
          {label}
          <span className="text-neutral-700"> · {sub}</span>
        </p>
      </div>
    </div>
  );
}
