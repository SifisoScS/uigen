"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { type MeshHandshakeResponse } from "@/lib/mesh-client";
import { prisma } from "@/lib/prisma";
import { getUIGenIdentity } from "@/lib/uigen-identity";

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

  // Check for existing — if found, re-handshake to refresh nodeId + publicKey (node may have restarted)
  const existing = await prisma.externalRepo.findUnique({ where: { url } });
  if (existing) {
    let nodeId = existing.nodeId;
    let publicKey = existing.publicKey;
    try {
      const normalizedUrl = url.replace(/\/$/, "");
      const identity = getUIGenIdentity();
      const timestamp = Math.floor(Date.now() / 1000);
      const hsRes = await fetch(`${normalizedUrl}/mesh/handshake`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          signature: identity.sign(`${identity.did}:${timestamp}`),
          node_did: identity.did,
          public_key: identity.publicKeyHex,
          timestamp,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (hsRes.ok) {
        const hs = (await hsRes.json()) as MeshHandshakeResponse;
        if (hs.accepted && hs.my_node_info?.node_did) {
          nodeId = hs.my_node_info.node_did;
          publicKey = hs.my_node_info.public_key ?? null;
          await prisma.externalRepo.update({
            where: { id: existing.id },
            data: { nodeId, publicKey },
          });
        }
      }
    } catch { /* network failure — keep existing key */ }
    revalidatePath("/external-repos");
    return {
      id: existing.id,
      name: existing.name,
      url: existing.url,
      createdAt: existing.createdAt,
      alreadyExisted: true,
    };
  }

  // Optional mesh handshake (§13 + §17 + §22.4) — non-fatal; repo creation always proceeds
  let nodeId: string | null = null;
  let publicKey: string | null = null;
  try {
    const normalizedUrl = url.replace(/\/$/, "");
    // §22.4 — send real UIGen node identity (replace stub-phase-44)
    const identity = getUIGenIdentity();
    const timestamp = Math.floor(Date.now() / 1000);
    const canonical = `${identity.did}:${timestamp}`;
    const hsRes = await fetch(`${normalizedUrl}/mesh/handshake`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        signature: identity.sign(canonical),
        node_did: identity.did,
        public_key: identity.publicKeyHex,
        timestamp,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (hsRes.ok) {
      const hs = (await hsRes.json()) as MeshHandshakeResponse;
      if (hs.accepted && hs.my_node_info?.node_did) {
        nodeId = hs.my_node_info.node_did;
        publicKey = hs.my_node_info.public_key ?? null;   // §17 — store for verification
      }
    }
  } catch {
    // network failure or timeout — nodeId/publicKey stay null
  }

  const repo = await prisma.externalRepo.create({
    data: { name, url, apiKey: apiKey ?? null, nodeId, publicKey },
  });

  revalidatePath("/external-repos");
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
  nodeId: string | null;
  publicKey: string | null;
  lastSyncAt: Date | null;
  createdAt: Date;
}

/** Delete a registered external repo by id. */
export async function deleteExternalRepo(id: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  await prisma.externalRepo.delete({ where: { id } });
  revalidatePath("/external-repos");
}

/** Return all registered external repos (no sensitive apiKey). */
export async function listExternalRepos(): Promise<ListExternalReposResult[]> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  return prisma.externalRepo.findMany({
    select: { id: true, name: true, url: true, nodeId: true, publicKey: true, lastSyncAt: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}
