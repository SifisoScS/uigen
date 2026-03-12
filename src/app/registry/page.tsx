import Link from "next/link";
import { Package } from "lucide-react";
import { RegistryClient, type ArtifactItem } from "./RegistryClient";

export const dynamic = "force-dynamic";

const POPULAR_TAGS = [
  "button",
  "card",
  "form",
  "navigation",
  "modal",
  "table",
  "dashboard",
  "shadcn",
  "chart",
  "pricing",
];

async function fetchRegistryPage(): Promise<{
  items: ArtifactItem[];
  total: number;
}> {
  try {
    // In server components we call the registry logic directly rather
    // than making an HTTP round-trip to ourselves.
    const { prisma } = await import("@/lib/prisma");
    const PAGE_SIZE = 20;

    const rows = await prisma.publicArtifact.findMany({
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        version: true,
        description: true,
        previewImage: true,
        remixCount: true,
        manifest: true,
        createdAt: true,
        authorId: true,
        parentArtifactId: true,
      },
    });

    const total = await prisma.publicArtifact.count();

    // Batch-fetch parent names
    const parentIds = [
      ...new Set(rows.map((r) => r.parentArtifactId).filter(Boolean) as string[]),
    ];
    const parentMap = new Map<string, string>();
    if (parentIds.length > 0) {
      const parents = await prisma.publicArtifact.findMany({
        where: { id: { in: parentIds } },
        select: { id: true, name: true },
      });
      for (const p of parents) parentMap.set(p.id, p.name);
    }

    const items: ArtifactItem[] = rows.map((r) => {
      const manifest = r.manifest as Record<string, unknown>;
      return {
        id: r.id,
        name: r.name,
        version: r.version,
        description: r.description ?? null,
        previewImage: r.previewImage ?? null,
        remixCount: r.remixCount,
        tags: Array.isArray(manifest?.registryTags)
          ? (manifest.registryTags as string[])
          : [],
        policyType:
          ((manifest?.governancePolicy as Record<string, unknown> | undefined)
            ?.policyType as string) ?? null,
        authorId: r.authorId ?? null,
        createdAt: r.createdAt.toISOString(),
        parentArtifactId: r.parentArtifactId ?? null,
        parentArtifactName: r.parentArtifactId
          ? (parentMap.get(r.parentArtifactId) ?? null)
          : null,
      };
    });

    return { items, total };
  } catch {
    return { items: [], total: 0 };
  }
}

export default async function RegistryPage() {
  const { items, total } = await fetchRegistryPage();

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-neutral-100">
      {/* Header */}
      <header className="border-b border-[#1f1f1f] bg-[#111111]">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-700 flex items-center justify-center">
              <Package className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-neutral-100">
                UIGen Registry
              </h1>
              <p className="text-xs text-neutral-500">
                Governed, remixable UI artifacts
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            ← Back to UIGen
          </Link>
        </div>
      </header>

      {/* Hero */}
      <div className="border-b border-[#1a1a1a] bg-[#0d0d0d]">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-neutral-50">
                Discover &amp; Remix
              </h2>
              <p className="mt-1 text-sm text-neutral-500 max-w-xl">
                Browse governed UI artifacts published from release branches.
                Every artifact carries provenance, policy, and a verified
                manifest — one click to remix into your own project.
              </p>
            </div>
            <div className="flex-shrink-0 text-right">
              <p className="text-2xl font-bold text-neutral-200">{total}</p>
              <p className="text-xs text-neutral-600">
                artifact{total !== 1 ? "s" : ""} published
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <RegistryClient
          initialItems={items}
          initialTotal={total}
          popularTags={POPULAR_TAGS}
        />
      </main>
    </div>
  );
}
