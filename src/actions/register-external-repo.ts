"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface RegisterExternalRepoInput {
  name: string;
  url: string;
  apiKey?: string;
}

export interface RegisterExternalRepoResult {
  id: string;
  name: string;
  url: string;
  createdAt: Date;
  alreadyExisted: boolean;
}

/**
 * Register (or return) an external UIGen registry instance.
 * Idempotent: if a repo with the same URL exists, it is returned unchanged.
 */
export async function registerExternalRepo(
  input: RegisterExternalRepoInput
): Promise<RegisterExternalRepoResult> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const { name, url, apiKey } = input;
  if (!url.startsWith("http")) throw new Error("url must be an absolute HTTP/HTTPS URL");

  // Check for existing
  const existing = await prisma.externalRepo.findUnique({ where: { url } });
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      url: existing.url,
      createdAt: existing.createdAt,
      alreadyExisted: true,
    };
  }

  // Optional mesh handshake (§13) — non-fatal; repo creation always proceeds
  let nodeId: string | null = null;
  try {
    const normalizedUrl = url.replace(/\/$/, "");
    const hsRes = await fetch(`${normalizedUrl}/mesh/handshake`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ signature: "stub-phase-40" }),
      signal: AbortSignal.timeout(5000),
    });
    if (hsRes.ok) {
      const hs = (await hsRes.json()) as { accepted?: boolean; my_node_info?: { node_did?: string } };
      if (hs.accepted && hs.my_node_info?.node_did) {
        nodeId = hs.my_node_info.node_did;
      }
    }
  } catch {
    // network failure or timeout — nodeId stays null
  }

  const repo = await prisma.externalRepo.create({
    data: { name, url, apiKey: apiKey ?? null, nodeId },
  });

  return {
    id: repo.id,
    name: repo.name,
    url: repo.url,
    createdAt: repo.createdAt,
    alreadyExisted: false,
  };
}

export interface ListExternalReposResult {
  id: string;
  name: string;
  url: string;
  lastSyncAt: Date | null;
  createdAt: Date;
}

/** Return all registered external repos (no sensitive apiKey). */
export async function listExternalRepos(): Promise<ListExternalReposResult[]> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  return prisma.externalRepo.findMany({
    select: { id: true, name: true, url: true, lastSyncAt: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}
