"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface ExternalArtifactData {
  id: string;
  name: string;
  version: string;
  description: string | null;
  semanticSummary: string | null;
  componentTree: unknown;
  styleSignature: unknown;
  remixCount: number;
  authorId: string | null;
  createdAt: string;
}

export interface FetchExternalArtifactResult {
  repoId: string;
  repoName: string;
  artifact: ExternalArtifactData;
  fetchedAt: Date;
}

/**
 * Fetch artifact metadata from a registered external UIGen registry via HTTP GET.
 *
 * The remote registry must expose a JSON endpoint at:
 *   GET {repo.url}/api/registry/{artifactId}
 *
 * The response is expected to conform to ExternalArtifactData.
 * No local write occurs — this is a pure read.  Use `linkExternalArtifact` to
 * persist a cross-repo relation after inspecting the fetched data.
 */
export async function fetchExternalArtifact(
  externalRepoId: string,
  remoteArtifactId: string
): Promise<FetchExternalArtifactResult> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const repo = await prisma.externalRepo.findUnique({
    where: { id: externalRepoId },
    select: { id: true, name: true, url: true, apiKey: true },
  });
  if (!repo) throw new Error("ExternalRepo not found");

  const endpoint = `${repo.url.replace(/\/$/, "")}/api/registry/${remoteArtifactId}`;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (repo.apiKey) headers["Authorization"] = `Bearer ${repo.apiKey}`;

  let response: Response;
  try {
    response = await fetch(endpoint, { headers, cache: "no-store" });
  } catch (err) {
    throw new Error(`Network error fetching ${endpoint}: ${String(err)}`);
  }

  if (!response.ok) {
    throw new Error(
      `Remote registry returned ${response.status} for artifact ${remoteArtifactId}`
    );
  }

  let artifact: ExternalArtifactData;
  try {
    artifact = (await response.json()) as ExternalArtifactData;
  } catch {
    throw new Error("Remote registry response was not valid JSON");
  }

  return {
    repoId: repo.id,
    repoName: repo.name,
    artifact,
    fetchedAt: new Date(),
  };
}
