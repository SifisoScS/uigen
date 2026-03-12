import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const search = searchParams.get("search")?.trim() ?? "";
  const tagsParam = searchParams.get("tags")?.trim() ?? "";
  const sortBy = searchParams.get("sortBy") ?? "createdAt";
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));

  const tags = tagsParam
    ? tagsParam.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  const orderBy =
    sortBy === "remixCount"
      ? { remixCount: "desc" as const }
      : { createdAt: "desc" as const };

  // Fetch all artifacts (in-memory filter for SQLite MVP)
  const rows = await prisma.publicArtifact.findMany({
    orderBy,
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

  // In-memory filter for search + tags
  const filtered = rows.filter((r) => {
    if (search) {
      const haystack = `${r.name} ${r.description ?? ""}`.toLowerCase();
      if (!haystack.includes(search.toLowerCase())) return false;
    }
    if (tags.length > 0) {
      const manifest = r.manifest as Record<string, unknown>;
      const artifactTags = Array.isArray(manifest?.registryTags)
        ? (manifest.registryTags as string[])
        : [];
      if (!tags.some((t) => artifactTags.includes(t))) return false;
    }
    return true;
  });

  const total = filtered.length;
  const page = filtered.slice(offset, offset + PAGE_SIZE);

  // Batch-fetch parent names for any artifacts that have a parentArtifactId
  const parentIds = [
    ...new Set(page.map((r) => r.parentArtifactId).filter(Boolean) as string[]),
  ];
  const parentMap = new Map<string, string>();
  if (parentIds.length > 0) {
    const parents = await prisma.publicArtifact.findMany({
      where: { id: { in: parentIds } },
      select: { id: true, name: true },
    });
    for (const p of parents) parentMap.set(p.id, p.name);
  }

  const items = page.map((r) => {
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
        (manifest?.governancePolicy as Record<string, unknown> | undefined)
          ?.policyType ?? null,
      authorId: r.authorId ?? null,
      createdAt: r.createdAt.toISOString(),
      parentArtifactId: r.parentArtifactId ?? null,
      parentArtifactName: r.parentArtifactId
        ? (parentMap.get(r.parentArtifactId) ?? null)
        : null,
    };
  });

  return NextResponse.json({
    items,
    total,
    offset,
    hasMore: offset + PAGE_SIZE < total,
  });
}
