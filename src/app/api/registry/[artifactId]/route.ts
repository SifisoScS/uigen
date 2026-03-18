import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/registry/[artifactId]
 *
 * Individual artifact endpoint for cross-repo federation.
 * Remote UIGen instances call this when following an externalArtifactUrl.
 *
 * Returns a subset of PublicArtifact fields that are safe to expose externally:
 * no filesData, no authorId resolution, no governance internals.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ artifactId: string }> }
) {
  const { artifactId } = await params;

  const artifact = await prisma.publicArtifact.findUnique({
    where: { id: artifactId },
    select: {
      id: true,
      name: true,
      version: true,
      description: true,
      semanticSummary: true,
      componentTree: true,
      styleSignature: true,
      remixCount: true,
      authorId: true,
      createdAt: true,
    },
  });

  if (!artifact) {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: artifact.id,
    name: artifact.name,
    version: artifact.version,
    description: artifact.description ?? null,
    semanticSummary: artifact.semanticSummary ?? null,
    componentTree: artifact.componentTree ?? null,
    styleSignature: artifact.styleSignature ?? null,
    remixCount: artifact.remixCount,
    authorId: artifact.authorId ?? null,
    createdAt: artifact.createdAt.toISOString(),
  });
}
